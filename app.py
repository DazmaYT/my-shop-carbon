from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS
import re
import os
import json
import requests


def is_valid_email(email):
    return re.match(r"[^@]+@[^@]+\.[^@]+", email)

def is_valid_phone(phone):
    # Проверка на формат +7 или 8 и 10 цифр (Казахстан/РФ)
    return re.match(r"^(\+7|8|7)[\s\-]?\(?[7]\d{2}\)?[\s\-]?\d{3}[\s\-]?\d{2}[\s\-]?\d{2}$", phone)
app = Flask(__name__)
CORS(app)

# --- НАСТРОЙКИ ---
app.config['SECRET_KEY'] = 'dark-matter-artisan-2026-secret'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///dark_matter.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# ДАННЫЕ TELEGRAM
TG_TOKEN = "8657221470:AAG9C0OKODtjuVfKkLUtXIstW1YPxxL0HKY"
TG_ADMIN_ID = "6593434022"

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = 'index'

# --- ФУНКЦИИ УВЕДОМЛЕНИЙ ---
def send_tg_notification(text):
    try:
        url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
        payload = {"chat_id": TG_ADMIN_ID, "text": text, "parse_mode": "HTML"}
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"Ошибка отправки в Telegram: {e}")

# --- МОДЕЛИ ДАННЫХ ---
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    phone = db.Column(db.String(20), default='')
    address = db.Column(db.String(200), default='')
    city = db.Column(db.String(50), default='Павлодар')

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    total_price = db.Column(db.Float, nullable=False)
    items = db.Column(db.Text, nullable=False) 
    kaspi_phone = db.Column(db.String(20), nullable=False)
    address = db.Column(db.String(255), nullable=False, default="Не указан") # ПРОВЕРЬ ЭТУ СТРОКУ
    status = db.Column(db.String(50), default='В ОБРАБОТКЕ') 
    date = db.Column(db.DateTime, default=db.func.current_timestamp())
    user = db.relationship('User', backref=db.backref('orders', lazy=True))

# --- ФУНКЦИЯ ОТПРАВКИ С КНОПКАМИ ---
def send_tg_order_with_buttons(order, items_text):
    url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
    
    # Создаем кнопки
    keyboard = {
        "inline_keyboard": [
            [
                {"text": "✅ ОПЛАЧЕНО", "callback_data": f"status_pay_{order.id}"},
                {"text": "❌ ОТКАЗ", "callback_data": f"status_cancel_{order.id}"}
            ]
        ]
    }

    tg_text = (
        f"<b>🚀 НОВЫЙ ЗАКАЗ #{order.id}</b>\n"
        f"👤 Клиент: {current_user.username}\n"
        f"📞 Kaspi: <code>{order.kaspi_phone}</code>\n"
        f"📍 Адрес: <b>{order.address}</b>\n"
        f"💰 Сумма: {order.total_price} ₸\n\n"
        f"📦 Состав:\n{items_text}\n\n"
        f"<i>Нажми кнопку ниже, чтобы изменить статус у клиента</i>"
    )

    payload = {
        "chat_id": TG_ADMIN_ID,
        "text": tg_text,
        "parse_mode": "HTML",
        "reply_markup": json.dumps(keyboard)
    }
    try:
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"Ошибка ТГ: {e}")

@app.route('/tg_webhook', methods=['POST'])
def tg_webhook():
    data = request.get_json()
    
    if "callback_query" in data:
        callback = data["callback_query"]
        callback_id = callback["id"] # ID самого нажатия
        callback_data = callback["data"]
        message_id = callback["message"]["message_id"]
        chat_id = callback["message"]["chat"]["id"]

        # 1. СРАЗУ ОТВЕЧАЕМ ТЕЛЕГРАМУ (чтобы кнопка перестала крутиться)
        answer_url = f"https://api.telegram.org/bot{TG_TOKEN}/answerCallbackQuery"
        requests.post(answer_url, json={"callback_query_id": callback_id})

        # 2. Разбираем данные (убедись, что callback_data реально имеет 2 подчеркивания)
        # Если кнопки созданы как "status_pay_15", то split('_') даст ['status', 'pay', '15']
        parts = callback_data.split('_')
        if len(parts) < 3:
            return jsonify({"status": "error", "message": "wrong data format"}), 200
            
        action = parts[1]
        order_id = int(parts[2])

        # 3. Работаем с базой
        # Используем Session.get() вместо старого Query.get()
        order = db.session.get(Order, order_id) 
        
        if order:
            if action == "pay":
                order.status = "ОПЛАЧЕНО. ОЖИДАЕТ ДОСТАВКИ"
                status_icon = "✅ ОПЛАЧЕНО"
            else:
                order.status = "ОТКАЗАН"
                status_icon = "❌ ОТКАЗАН"
            
            db.session.commit()

            # 4. Обновляем текст в боте (убираем кнопки)
            new_text = callback["message"]["text"] + f"\n\n🛑 <b>ИТОГ: {status_icon}</b>"
            update_url = f"https://api.telegram.org/bot{TG_TOKEN}/editMessageText"
            requests.post(update_url, json={
                "chat_id": chat_id,
                "message_id": message_id,
                "text": new_text,
                "parse_mode": "HTML"
            })

    return jsonify({"status": "ok"}), 200

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

with app.app_context():
    db.create_all()

# --- МАРШРУТЫ ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/check_auth')
def check_auth():
    if current_user.is_authenticated:
        return jsonify({
            "is_auth": True, "username": current_user.username,
            "phone": current_user.phone, "address": current_user.address
        })
    return jsonify({"is_auth": False})

@app.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        email = data.get('email', '').strip().lower() # Приводим к нижнему регистру
        password = data.get('password', '')

        # 1. Базовые проверки на пустоту
        if not username or not email or not password:
            return jsonify({"success": False, "message": "ЗАПОЛНИТЕ ВСЕ ПОЛЯ"}), 400

        # 2. Проверка длины
        if len(username) < 3:
            return jsonify({"success": False, "message": "ИМЯ МИНИМУМ 3 СИМВОЛА"}), 400
        if len(password) < 6:
            return jsonify({"success": False, "message": "ПАРОЛЬ МИНИМУМ 6 СИМВОЛОВ"}), 400

        # 3. Валидация Email через регулярку
        email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_regex, email):
            return jsonify({"success": False, "message": "НЕВЕРНЫЙ ФОРМАТ ПОЧТЫ"}), 400

        # 4. Проверка на уникальность Username
        if User.query.filter_by(username=username).first():
            return jsonify({"success": False, "message": "ЭТО ИМЯ УЖЕ ЗАНЯТО"}), 400

        # 5. Проверка на уникальность Email (чтобы не плодили аккаунты)
        if User.query.filter_by(email=email).first():
            return jsonify({"success": False, "message": "ПОЧТА УЖЕ ИСПОЛЬЗУЕТСЯ"}), 400
        
        # Если всё ок — хешируем и сохраняем
        hashed_pw = generate_password_hash(password, method='scrypt')
        new_user = User(username=username, email=email, password=hashed_pw)
        
        db.session.add(new_user)
        db.session.commit()
        
        login_user(new_user)
        return jsonify({"success": True, "message": "РЕГИСТРАЦИЯ УСПЕШНА"})

    except Exception as e:
        db.session.rollback() # Откатываем базу в случае ошибки
        return jsonify({"success": False, "message": "ОШИБКА СЕРВЕРА"}), 500

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()
    if user and check_password_hash(user.password, data.get('password')):
        login_user(user, remember=True)
        return jsonify({"success": True, "username": user.username, "phone": user.phone})
    return jsonify({"success": False, "message": "ОШИБКА ВХОДА"}), 401

@app.route('/place_order', methods=['POST'])
@login_required
def place_order():
    try:
        data = request.get_json()
        items = data.get('items', [])
        total_raw = data.get('total', '0')
        kaspi_phone = data.get('kaspi_phone', '').strip()
        address = data.get('address', '').strip() # ДОБАВИЛИ АДРЕС
        
        if not kaspi_phone or not address:
            return jsonify({"success": False, "message": "ЗАПОЛНИТЕ ТЕЛЕФОН И АДРЕС"}), 400

        total = float(str(total_raw).replace(' ', '').replace('₸', ''))
        
        new_order = Order(
            user_id=current_user.id,
            total_price=total,
            items=json.dumps(items, ensure_ascii=False),
            kaspi_phone=kaspi_phone,
            address=address, # Сохраняем адрес
            status="В ОБРАБОТКЕ"
        )
        db.session.add(new_order)
        db.session.commit()

        items_list = "\n".join([f"▫️ {i['name']} x{i['quantity']}" for i in items])
        
        # Вызываем функцию с кнопками
        send_tg_order_with_buttons(new_order, items_list)

        return jsonify({"success": True, "order_id": new_order.id})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "message": "ОШИБКА СЕРВЕРА"}), 500

@app.route('/get_orders', methods=['GET'])
@login_required
def get_orders():
    orders = Order.query.filter_by(user_id=current_user.id).order_by(Order.date.desc()).all()
    orders_list = []
    for o in orders:
        orders_list.append({
            "id": o.id, "date": o.date.strftime('%d.%m.%Y'),
            "total": o.total_price, "status": o.status,
            "items": json.loads(o.items)
        })
    return jsonify({"success": True, "orders": orders_list})

@app.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')