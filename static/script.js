/* =========================================
   1. ИНИЦИАЛИЗАЦИЯ И СОСТОЯНИЕ
   ========================================= */
let cart = JSON.parse(localStorage.getItem('darkMatterCart')) || []; 
let currentUser = { name: "ГОСТЬ", phone: "", address: "", email: "" };

document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus(); 
    renderCart();

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-buy')) {
            const card = e.target.closest('.card');
            const name = card.querySelector('h3').innerText;
            const price = parseInt(card.querySelector('.price').innerText.replace(/\D/g, ''));
            const img = card.querySelector('img').src; // Захватываем картинку
            addToCart(name, price, img);
        }
    });
});

/* =========================================
   2. УПРАВЛЕНИЕ ПАНЕЛЯМИ
   ========================================= */
window.openPanel = function(selector) {
    const el = document.querySelector(selector);
    if (el) {
        el.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
};

window.closePanel = function(selector) {
    const el = document.querySelector(selector);
    if (el) {
        el.classList.remove('active');
        document.body.style.overflow = '';
    }
};

/* =========================================
   3. ЛОГИКА АВТОРИЗАЦИИ
   ========================================= */
function checkAuthStatus() {
    fetch('/check_auth')
        .then(res => res.json())
        .then(data => {
            if (data.is_auth) {
                currentUser = { name: data.username, phone: data.phone };
                document.getElementById('display-name').innerText = currentUser.name.toUpperCase();
                document.getElementById('view-phone').innerText = currentUser.phone || "НЕ УКАЗАН";
                
                // Если юзер вошел, вставляем его телефон в поле Kaspi автоматически
                const kaspiInput = document.getElementById('kaspi-phone-input');
                if (kaspiInput && currentUser.phone) kaspiInput.value = currentUser.phone;

                switchAuth('profile');
                fetchOrderHistory(); // Сразу грузим историю
            } else {
                switchAuth('login');
            }
        }).catch(() => switchAuth('login'));
}

window.switchAuth = function(state) {
    const sections = ['auth-login-section', 'auth-reg-section', 'auth-profile-section'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const target = document.getElementById(`auth-${state}-section`);
    if (target) target.style.display = 'block';
};

window.toggleEdit = function(show) {
    document.getElementById('profile-view-section').style.display = show ? 'none' : 'block';
    document.getElementById('profile-edit-section').style.display = show ? 'block' : 'none';
    if(show) {
        document.getElementById('edit-name').value = currentUser.name;
        document.getElementById('edit-phone').value = currentUser.phone || "";
    }
};

window.loginUser = function() {
    const username = document.getElementById('login-name').value;
    const password = document.getElementById('login-pass').value;

    fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    }).then(res => res.json()).then(data => {
        if (data.success) {
            showToast("ДОСТУП РАЗРЕШЕН", "success");
            checkAuthStatus();
        } else {
            showToast(data.message, "error");
        }
    });
};

window.registerUser = function() {
    const username = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-pass').value;
    const confirm_password = document.getElementById('reg-pass-confirm').value;

    fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, confirm_password })
    }).then(res => res.json()).then(data => {
        if (data.success) {
            showToast("АККАУНТ СОЗДАН");
            switchAuth('login');
        } else { showToast(data.message, "error"); }
    });
};

window.saveProfileChanges = function() {
    const data = {
        username: document.getElementById('edit-name').value,
        phone: document.getElementById('edit-phone').value,
        password: document.getElementById('edit-pass').value
    };

    fetch('/update_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).then(res => res.json()).then(d => {
        if(d.success) { showToast("ОБНОВЛЕНО"); location.reload(); }
        else { showToast(d.message, "error"); }
    });
};

window.logoutUser = function() {
    fetch('/logout', { method: 'POST' }).then(() => location.reload());
};

/* =========================================
   4. КОРЗИНА И ОПЛАТА
   ========================================= */
function addToCart(name, price, image) {
    const item = cart.find(i => i.name === name);
    item ? item.quantity++ : cart.push({ name, price, img: image, quantity: 1 });
    localStorage.setItem('darkMatterCart', JSON.stringify(cart));
    renderCart();
    showToast(`ДОБАВЛЕНО: ${name}`);
}

function renderCart() {
    const container = document.getElementById('cart-items-container');
    const totalEl = document.getElementById('sum-value');
    const counts = document.querySelectorAll('.cart-count');
    
    let totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    counts.forEach(el => el.innerText = totalItems);
    
    if (cart.length === 0) {
        container.innerHTML = '<div class="empty-cart-msg" style="opacity:0.3; text-align:center; margin-top:100px; font-size: 11px; letter-spacing: 2px;">ПУСТО</div>';
        totalEl.innerText = '0';
        return;
    }

    container.innerHTML = '';
    let total = 0;
    cart.forEach((item, index) => {
        total += item.price * item.quantity;
        const imgPath = item.img || `/static/images/${item.name.split(' ')[0].toLowerCase()}.jpg`;
        
        container.innerHTML += `
            <div class="cart-item">
                <img src="${imgPath}" class="cart-img-min" onerror="this.src='/static/images/logo.png'">
                <div class="cart-item-info">
                    <p>${item.name}</p>
                    <span class="cart-item-price">${item.price} ₸</span>
                </div>
                <div class="qty-controls">
                    <button onclick="changeQty(${index}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button onclick="changeQty(${index}, 1)">+</button>
                </div>
            </div>`;
    });
    totalEl.innerText = total;
}

window.changeQty = (index, delta) => {
    cart[index].quantity += delta;
    if (cart[index].quantity <= 0) cart.splice(index, 1);
    localStorage.setItem('darkMatterCart', JSON.stringify(cart));
    renderCart();
};

window.checkout = function() {
    if (cart.length === 0) return showToast("КОРЗИНА ПУСТА", "error");
    closePanel('#cart-modal');
    document.getElementById('pay-sum').innerText = document.getElementById('sum-value').innerText;
    openPanel('#payment-modal');
};

// ГЛАВНАЯ ФУНКЦИЯ ОПЛАТЫ
window.confirmPayment = async function() {
    // 1. Получаем данные из полей ввода
    const kaspiInput = document.getElementById('kaspi-phone-input').value.trim();
    const addressInput = document.getElementById('address-input') ? document.getElementById('address-input').value.trim() : "";

    // 2. Проверка корзины
    if (cart.length === 0) {
        showToast("КОРЗИНА ПУСТА", "error");
        return;
    }

    // 3. Проверка авторизации
    if (currentUser.name === "ГОСТЬ") {
        showToast("ДЛЯ ЗАКАЗА НУЖНО ВОЙТИ", "error");
        closePanel('#payment-modal');
        openPanel('#profile-modal');
        switchAuth('login');
        return;
    }

    // 4. Проверка заполнения полей (Телефон и Адрес)
    if (!kaspiInput || kaspiInput.length < 10) {
        showToast("УКАЖИТЕ ВЕРНЫЙ НОМЕР KASPI", "error");
        return;
    }

    if (!addressInput) {
        showToast("УКАЖИТЕ АДРЕС ДОСТАВКИ", "error");
        return;
    }

    // 5. Визуальная индикация загрузки
    const paySum = document.getElementById('pay-sum').innerText;
    const confirmBtn = document.getElementById('confirm-pay-btn');
    confirmBtn.innerText = "ОБРАБОТКА...";
    confirmBtn.disabled = true; // Блокируем кнопку от повторных нажатий

    try {
        // 6. Отправка запроса на сервер
        const response = await fetch('/place_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                total: paySum,
                items: cart,
                kaspi_phone: kaspiInput,
                address: addressInput // Передаем адрес
            })
        });

        const data = await response.json();

        if (data.success) {
            // 7. Очистка корзины при успехе
            cart = []; 
            localStorage.setItem('darkMatterCart', JSON.stringify(cart));
            renderCart();
            
            closePanel('#payment-modal');
            showToast("ЗАКАЗ ОФОРМЛЕН", "success");
            
            // 8. Обновляем историю в профиле, чтобы увидеть новый статус
            if (typeof fetchOrderHistory === "function") {
                fetchOrderHistory();
            }
        } else {
            showToast(data.message || "ОШИБКА ОФОРМЛЕНИЯ", "error");
        }
    } catch (error) {
        console.error("Order error:", error);
        showToast("ОШИБКА СОЕДИНЕНИЯ С СЕРВЕРОМ", "error");
    } finally {
        // 9. Возвращаем кнопку в исходное состояние
        confirmBtn.innerText = "ОФОРМИТЬ ЗАКАЗ";
        confirmBtn.disabled = false;
    }
};

// ИСТОРИЯ ЗАКАЗОВ ИЗ БАЗЫ
async function fetchOrderHistory() {
    const container = document.getElementById('order-history-list');
    if (!container) return;

    try {
        const response = await fetch('/get_orders');
        const data = await response.json();

        if (data.success && data.orders.length > 0) {
            container.innerHTML = data.orders.map(order => `
                <div class="order-item">
                    <div class="order-info">
                        <div class="order-header">
                            <span class="order-id">ЗАКАЗ #${order.id}</span>
                            <span class="order-date">${order.date}</span>
                        </div>
                        <div style="color: #888; font-size: 10px; margin: 5px 0;">СУММА: <span style="color:#fff">${order.total} ₸</span></div>
                        <div class="order-footer">
                            <span class="status-badge" style="color: #ffaa00">${order.status}</span>
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="empty-history">НЕТ ЗАКАЗОВ</div>';
        }
    } catch (error) {
        container.innerHTML = '<div class="empty-history">ОШИБКА ЗАГРУЗКИ</div>';
    }
}

/* =========================================
   5. TOAST И ПЛАВНЫЙ СКРОЛЛ
   ========================================= */
function showToast(msg, type = "success") {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerText = msg;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
}

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            window.scrollTo({
                top: target.offsetTop - 80,
                behavior: 'smooth'
            });
        }
    });
});