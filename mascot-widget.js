(function () {
    'use strict';
 
    // ------------------------------------------------------------------
    // 1. CSS Styles (для инкапсуляции в Shadow DOM)
    // ------------------------------------------------------------------
    const WIDGET_CSS = `
    :host {
        /* --- ПЕРЕМЕННЫЕ --- */
        --mascot-primary-color: #4CAF50;
        --mascot-secondary-color: #f0f0f0;
        --mascot-font-family: Arial, sans-serif;
        --mascot-text-color: #333;
        --mascot-border-radius: 12px;

        /* === РАЗМЕРЫ СПРАЙТА (200x200) === */
        --frame-width: 200px;
        --frame-height: 200px;
        --sprite-row-width: 2000px;

        /* === МОБИЛЬНЫЙ РАЗМЕР МАСКОТА === */
        --mascot-mobile-scale: 0.65;

        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        font-family: var(--mascot-font-family);
        overflow: visible;
    }

    .mascot-widget-container {
        position: relative;
    }

    /* ─── ОБЁРТКА МАСКОТА ────────────────────────────────────────── */
    .mascot-wrapper {
        position: fixed;
        bottom: 70px;
        right: 380px;
        width: var(--frame-width);
        height: var(--frame-height);
        z-index: 2147483647;
        pointer-events: none;

        /* Улучшенная анимация появления: пружина + масштаб */
        transition:
            transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
            opacity   0.3s ease;
        opacity: 0;
        transform: translateX(20px) scale(0.85);
        transform-origin: bottom right;

        overflow: visible;
    }

    .mascot-wrapper.is-visible {
        opacity: 1;
        transform: translateX(0) scale(1);
    }

    .mascot-wrapper.is-moving {
        transition: transform 2s ease-in-out;
    }

    /* ─── СПРАЙТ ─────────────────────────────────────────────────── */
    .mascot-sprite {
        width: 100%;
        height: 100%;
        background-image: url('AllSprites.png');
        background-repeat: no-repeat;
        background-size: 2000px 1000px;
        background-position: 0 -400px;
        pointer-events: none;
    }

    /* ─── АНИМАЦИИ СПРАЙТА ───────────────────────────────────────── */
    @keyframes play-sprite {
        from { background-position-x: 0; }
        to   { background-position-x: calc(-1 * var(--sprite-row-width)); }
    }

    .mascot-sprite.is-running  { background-position-y: 0px;    animation: play-sprite 0.8s steps(10) infinite; }
    .mascot-sprite.is-waving   { background-position-y: -200px; animation: play-sprite 1s   steps(10) infinite; }
    .mascot-sprite.is-idle     { background-position-y: -400px; animation: play-sprite 1.5s steps(10) infinite; }
    .mascot-sprite.is-thinking { background-position-y: -600px; animation: play-sprite 1.5s steps(10) infinite; }
    .mascot-sprite.is-pointing { background-position-y: -800px; animation: play-sprite 1.5s steps(10) infinite; }

    /* ─── ОБЛАЧКО ────────────────────────────────────────────────── */
    .mascot-speech-bubble {
        position: absolute;
        left: 90%;
        top: 10px;
        width: 200px;
        background: #fff;
        border-radius: 30px;
        border: 2px solid #333;
        box-shadow: 3px 3px 0px rgba(0,0,0,0.1);
        padding: 15px;
        opacity: 0;
        visibility: hidden;
        transform: translateX(10px) scale(0.9);
        transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        pointer-events: auto;
        z-index: 10;
    }

    .mascot-speech-bubble::before {
        content: '';
        position: absolute;
        z-index: 11;
        bottom: 10px;
        left: -12px;
        width: 20px;
        height: 20px;
        background: #fff;
        border: 2px solid #333;
        border-radius: 50%;
    }

    .mascot-speech-bubble::after {
        content: '';
        position: absolute;
        z-index: 11;
        bottom: -5px;
        left: -28px;
        width: 12px;
        height: 12px;
        background: #fff;
        border: 2px solid #333;
        border-radius: 50%;
    }

    .mascot-speech-bubble.is-active {
        opacity: 1;
        visibility: visible;
        transform: translateX(0) scale(1);
    }

    .bubble-text {
        font-size: 13px;
        font-weight: 500;
        color: #333;
        line-height: 1.4;
        font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif;
    }

    /* ─── ПОЛЕ ВВОДА (мини) ──────────────────────────────────────── */
    .mascot-input-container {
        position: absolute;
        top: 95%;
        left: 50%;
        transform: translateX(-50%);
        width: 180px;
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        padding: 6px;
        border-radius: 20px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        display: flex;
        gap: 5px;
        pointer-events: auto;
        border: 1px solid #ddd;
        opacity: 1;
        transition: opacity 0.3s;
    }

    .mascot-wrapper.is-moving .mascot-input-container {
        opacity: 0.3;
        pointer-events: none;
    }

    .mini-input {
        flex-grow: 1;
        border: none;
        background: transparent;
        font-size: 12px;
        outline: none;
        padding-left: 5px;
        font-family: inherit;
    }

    .mini-send-btn {
        background: var(--mascot-primary-color);
        color: white;
        border: none;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        transition: background 0.2s, transform 0.1s;
    }
    .mini-send-btn:hover  { background: #43a047; }
    .mini-send-btn:active { transform: scale(0.9); }

    .mini-chat-btn {
        background: #2196F3;
        color: white;
        border: none;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        margin-left: 5px;
        transition: background 0.2s, transform 0.1s;
    }
    .mini-chat-btn:hover  { background: #1976D2; }
    .mini-chat-btn:active { transform: scale(0.9); }

    /* ─── КНОПКА-ТРИГГЕР ─────────────────────────────────────────── */
    .mascot-button-trigger {
        width: 60px;
        height: 60px;
        background-color: var(--mascot-primary-color);
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
        font-size: 24px;
        color: white;
        user-select: none;
        position: relative;
        z-index: 10002;
        /* Минимальный touch-target 44×44 по Apple HIG */
        min-width: 44px;
        min-height: 44px;
    }

    .mascot-button-trigger:hover  { transform: scale(1.08); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
    .mascot-button-trigger:active { transform: scale(0.94); }

    /* ─── ОКНО ЧАТА ─────────────────────────────────────────────── */
    .chat-window-wrapper {
        position: absolute;
        bottom: 80px;
        right: 0;
        width: 350px;
        max-height: 80vh;
        background: #fff;
        border-radius: var(--mascot-border-radius);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        opacity: 0;
        visibility: hidden;
        /* Улучшенная анимация: движение снизу + пружина */
        transform: translateY(16px) scale(0.97);
        transform-origin: bottom right;
        transition:
            opacity    0.3s ease,
            transform  0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
            visibility 0.3s;
        z-index: 10000;
    }

    .chat-window-wrapper.is-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
    }

    /* ─── ШАПКА ЧАТА ─────────────────────────────────────────────── */
    .chat-header {
        padding: 15px;
        background-color: var(--mascot-primary-color);
        color: #fff;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
        font-weight: bold;
    }

    .chat-close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        /* touch-target */
        min-width: 44px;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.15s;
    }
    .chat-close-btn:hover  { background: rgba(255,255,255,0.15); }
    .chat-close-btn:active { background: rgba(255,255,255,0.3); }

    .chat-clear-btn {
        background: none;
        border: none;
        color: rgba(255,255,255,0.7);
        font-size: 15px;
        cursor: pointer;
        padding: 2px 5px;
        border-radius: 4px;
        transition: color 0.2s;
        min-width: 36px;
        min-height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .chat-clear-btn:hover { color: white; }

    /* ─── СООБЩЕНИЯ ──────────────────────────────────────────────── */
    .chat-messages-container {
        flex-grow: 1;
        padding: 15px;
        overflow-y: auto;
        background-color: #f9f9f9;
        /* Плавный скролл на iOS */
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
    }

    .message {
        max-width: 80%;
        padding: 8px 12px;
        margin-bottom: 10px;
        border-radius: var(--mascot-border-radius);
        line-height: 1.4;
        /* Анимация появления нового сообщения */
        animation: msg-in 0.25s ease both;
    }

    @keyframes msg-in {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    .message.user {
        background-color: var(--mascot-primary-color);
        color: #fff;
        margin-left: auto;
        border-bottom-right-radius: 2px;
    }

    .message.mascot {
        background-color: var(--mascot-secondary-color);
        color: var(--mascot-text-color);
        margin-right: auto;
        border-bottom-left-radius: 2px;
    }

    /* ─── ИНДИКАТОР ПЕЧАТАНИЯ (три точки) ───────────────────────── */
    .message.mascot.is-typing {
        display: flex;
        gap: 4px;
        align-items: center;
        padding: 12px 16px;
    }

    .message.mascot.is-typing::before,
    .message.mascot.is-typing::after,
    .message.mascot.is-typing span {
        content: '';
        display: block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #999;
        animation: typing-dot 1.2s infinite ease-in-out;
    }

    .message.mascot.is-typing::before  { animation-delay: 0s;    }
    .message.mascot.is-typing span     { animation-delay: 0.2s;   }
    .message.mascot.is-typing::after   { animation-delay: 0.4s;   }

    @keyframes typing-dot {
        0%, 60%, 100% { transform: translateY(0);    opacity: 0.4; }
        30%            { transform: translateY(-5px); opacity: 1;   }
    }

    /* ─── ОБЛАСТЬ ВВОДА ──────────────────────────────────────────── */
    .chat-input-area {
        padding: 10px 15px;
        border-top: 1px solid #eee;
        display: flex;
        align-items: center;
        flex-shrink: 0;
        background-color: #fff;
        /* Защита от виртуальной клавиатуры: не перекрывается */
        padding-bottom: max(10px, env(safe-area-inset-bottom, 10px));
    }

    .chat-input-area textarea {
        flex-grow: 1;
        border: 1px solid #ccc;
        border-radius: 20px;
        padding: 10px 15px;
        margin-right: 10px;
        resize: none;
        font-family: var(--mascot-font-family);
        max-height: 100px;
        /* Предотвращает zoom на iOS при фокусе (min 16px) */
        font-size: 16px;
        transition: border-color 0.2s;
    }

    .chat-input-area textarea:focus {
        outline: none;
        border-color: var(--mascot-primary-color);
    }

    .send-button {
        background-color: var(--mascot-primary-color);
        color: #fff;
        border: none;
        border-radius: 50%;
        width: 44px;   /* touch-target */
        height: 44px;
        cursor: pointer;
        font-size: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
        flex-shrink: 0;
    }
    .send-button:hover   { background: #43a047; }
    .send-button:active  { transform: scale(0.9); }
    .send-button:disabled { background-color: #ccc; cursor: not-allowed; transform: none; }

    /* ─── ACTION BAR ─────────────────────────────────────────────── */
    .mascot-action-bar {
        padding: 10px 15px;
        border-top: 1px solid #eee;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        background-color: #fff;
        flex-shrink: 0;
    }

    .action-button {
        padding: 6px 12px;
        border: 1px solid var(--mascot-primary-color);
        background: transparent;
        color: var(--mascot-primary-color);
        border-radius: 20px;
        cursor: pointer;
        transition: background-color 0.2s, transform 0.1s;
        font-family: var(--mascot-font-family);
        font-size: 13px;
        white-space: nowrap;
        /* touch-target */
        min-height: 36px;
    }
    .action-button:hover  { background-color: var(--mascot-primary-color); color: #fff; }
    .action-button:active { transform: scale(0.95); }

    /* ─── ПОДСВЕТКА ЭЛЕМЕНТА ─────────────────────────────────────── */
    .mascot-highlight-box {
        position: absolute;
        border: 3px dashed var(--mascot-primary-color);
        background-color: var(--mascot-primary-color);
        opacity: 0.2;
        transition: all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        border-radius: 6px;
        pointer-events: none;
    }

    /* ═══════════════════════════════════════════════════════════════
       МОБИЛЬНАЯ АДАПТАЦИЯ
       Эти стили применяются поверх positionCSS (исправление бага),
       поэтому они вынесены в mobileOverrideCSS в _renderWidget()
       и там задаются с !important после positionCSS.
       Здесь — стили которые НЕ нужно переопределять positionCSS.
       ═══════════════════════════════════════════════════════════════ */

    @media (max-width: 600px) {

        /* --- Маскот меньше на телефоне --- */
        .mascot-wrapper {
            width: calc(var(--frame-width) * var(--mascot-mobile-scale));
            height: calc(var(--frame-height) * var(--mascot-mobile-scale));
            transform-origin: bottom center;
        }

        /* Спрайт масштабируем через background-size */
        .mascot-sprite {
            background-size:
                calc(2000px * var(--mascot-mobile-scale))
                calc(1000px * var(--mascot-mobile-scale));
            background-position-y: calc(-400px * var(--mascot-mobile-scale));
        }
        .mascot-sprite.is-running  { background-position-y: 0px; }
        .mascot-sprite.is-waving   { background-position-y: calc(-200px * var(--mascot-mobile-scale)); }
        .mascot-sprite.is-idle     { background-position-y: calc(-400px * var(--mascot-mobile-scale)); }
        .mascot-sprite.is-thinking { background-position-y: calc(-600px * var(--mascot-mobile-scale)); }
        .mascot-sprite.is-pointing { background-position-y: calc(-800px * var(--mascot-mobile-scale)); }

        /* Сдвигаем анимацию @keyframes под новый размер */
        @keyframes play-sprite {
            from { background-position-x: 0; }
            to   { background-position-x: calc(-1 * var(--sprite-row-width) * var(--mascot-mobile-scale)); }
        }

        /* --- Мини-инпут: оставляем, адаптируем под тач --- */
        /*
         * Проблема 1: при width 110px кнопки перекрывали поле ввода.
         *   Решение: flex-wrap — инпут занимает первую строку целиком (width:100%),
         *   кнопки переносятся на вторую строку и делят место поровну.
         *
         * Проблема 2: контейнер был внизу маскота (top: 95%) и наезжал на
         *   кнопку-триггер, которая находится чуть ниже.
         *   Решение: bottom: calc(100% + 8px) — вешаем контейнер НАД спрайтом,
         *   а не под ним. Так он всегда выше триггера, независимо от отступов.
         */
        .mascot-input-container {
            flex-wrap: wrap;        /* двухстрочный layout */
            width: 120px;
            left: auto;
            right: 0;
            transform: none;
            padding: 6px;
            /* Поднимаем над маскотом — не перекрывает триггер */
            top: auto;
            bottom: calc(100% + 8px);
        }

        /* Инпут — первая строка, на всю ширину контейнера */
        .mini-input {
            width: 100%;
            flex-grow: 0;
            flex-shrink: 1;
            min-width: 0;
            font-size: 16px;   /* iOS не зумирует при ≥16px */
            padding: 2px 6px;
        }

        /* Кнопки — вторая строка, делят место поровну */
        .mini-send-btn {
            flex: 1;
            height: 30px;
            font-size: 13px;
            flex-shrink: 0;
            border-radius: 8px;   /* на строке смотрится лучше чем круг */
        }
        .mini-chat-btn {
            flex: 1;
            height: 30px;
            font-size: 15px;
            flex-shrink: 0;
            margin-left: 4px;
            border-radius: 8px;
        }

        /* --- Облачко: на мобильном компактнее ---
           Позиция и хвостик зависят от угла (isLeft),
           поэтому задаются в mobileOverrideCSS ниже. */
        .mascot-speech-bubble {
            width: 150px;
            font-size: 12px;
            top: 0;
        }

        /* --- Чат — полноэкранный slideUp снизу --- */
        .chat-window-wrapper {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 100%;
            height: 100%;
            max-height: 100dvh;  /* dvh учитывает виртуальную клавиатуру */
            border-radius: 0;
            z-index: 10001;
            transform: translateY(100%);    /* slide-up вместо fade */
            transform-origin: bottom center;
        }

        .chat-window-wrapper.is-open {
            transform: translateY(0);
            opacity: 1;
            visibility: visible;
        }

        /* --- input-area: safe-area снизу на iPhone --- */
        .chat-input-area {
            padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
        }

        /* --- Textarea: увеличиваем для удобного набора --- */
        .chat-input-area textarea {
            font-size: 16px;  /* предотвращает auto-zoom на iOS */
        }

        /* --- Action buttons скролл по горизонтали на мобильном --- */
        .mascot-action-bar {
            flex-wrap: nowrap;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding-bottom: 12px;
        }
        .mascot-action-bar::-webkit-scrollbar { display: none; }
        .action-button { flex-shrink: 0; }

        /* --- Кнопка-триггер чуть меньше --- */
        .mascot-button-trigger {
            width: 54px;
            height: 54px;
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       ДОСТУПНОСТЬ: отключаем анимации если пользователь просит
       ═══════════════════════════════════════════════════════════════ */
    @media (prefers-reduced-motion: reduce) {
        .mascot-wrapper,
        .mascot-speech-bubble,
        .chat-window-wrapper,
        .mascot-button-trigger,
        .message {
            transition: none !important;
            animation: none !important;
        }
        .mascot-sprite.is-running,
        .mascot-sprite.is-waving,
        .mascot-sprite.is-idle,
        .mascot-sprite.is-thinking,
        .mascot-sprite.is-pointing {
            animation: none !important;
        }
    }
`;
 
    // ------------------------------------------------------------------
    // 2. HTML Скелет 
    // ------------------------------------------------------------------
    const WIDGET_HTML = `
        <div class="mascot-widget-container">
            <div class="chat-window-wrapper" id="chat-window">
                <div class="chat-header">
                    <span>AI Ассистент | Новик</span>
                    <div style="display:flex;gap:6px;align-items:center">
                        <button class="chat-clear-btn" id="chat-clear-btn" title="Очистить историю">🗑</button>
                        <button class="chat-close-btn" id="chat-close-btn">×</button>
                    </div>
                </div>
                <div class="chat-messages-container" id="messages-container">
                    <div class="message mascot">Привет! Я ваш личный AI-гид. С чем помочь? Например, "Какие есть продукты?" или "помоги сориентироваться".</div>
                </div>
                <div class="mascot-action-bar" id="action-bar">
                    <button class="action-button">что ты умеешь?</button>
                    <button class="action-button">Основные продукты</button>
                </div>
                <div class="chat-input-area">
                    <textarea id="chat-input" placeholder="Введите сообщение..." rows="1"></textarea>
                    <button class="send-button" id="send-button" disabled>➤</button>
                </div>
            </div>
            
            <div class="mascot-wrapper" id="mascot-wrapper">
                
                <div class="mascot-speech-bubble" id="mascot-bubble">
                    <div class="bubble-text" id="bubble-text">Привет! Я тут.</div>
                </div>
 
                <div class="mascot-sprite is-idle" id="mascot-sprite"></div>
 
                <div class="mascot-input-container">
                    <input type="text" class="mini-input" id="mini-input" placeholder="Напиши мне...">
                    <button class="mini-send-btn" id="mini-send">➤</button>
                    <button class="mini-chat-btn" id="open-full-chat-btn" title="Открыть чат">💬</button>
                </div>
 
            </div>
            
            <div class="mascot-button-trigger" id="mascot-trigger">🤖</div>
        </div>
    `;
 
    // ------------------------------------------------------------------
    // 3. Класс MascotWidget (Логика)
    // ------------------------------------------------------------------
    class MascotWidget {
        constructor(baseUrl) {
            this.isOpen = false;
            this.history = [];
            this.overlayHost = null;
            this.AI_API_URL = `${baseUrl}/api/chat`;
            this.CONFIG_API_URL = `${baseUrl}/api/config`;
            this.animationTimeout = null;
            // Уникальный ID сессии — генерируется один раз при загрузке страницы
            this.sessionId = crypto.randomUUID ? crypto.randomUUID()
                : Math.random().toString(36).slice(2) + Date.now().toString(36);
            this.STORAGE_KEY = `mascot_history`;
            this.MAX_HISTORY = 5;
 
            // Загружаем историю из sessionStorage (живёт пока открыта вкладка)
            try {
                const saved = sessionStorage.getItem(this.STORAGE_KEY);
                this.history = saved ? JSON.parse(saved) : [];
            } catch(e) {
                this.history = [];
            }
 
            // Запрашиваем конфиг перед рендером
            this._initWidget();
        }
 
        // --- НОВЫЙ МЕТОД ---
        async _initWidget() {
            try {
                const response = await fetch(this.CONFIG_API_URL);
                if (response.ok) {
                    const config = await response.json();
 
                    // Получаем базовый URL из CONFIG_API_URL (убираем /api/config)
                    const baseUrl = this.CONFIG_API_URL.split('/api/config')[0];
                    // Если sprite_url не полный URL, добавляем базовый путь
                    config.sprite_url = config.sprite_url.startsWith('http') 
                        ? config.sprite_url 
                        : `${baseUrl}/${config.sprite_url}`;
                    
                    this.clientConfig = config;
 
                    // === ДОБАВИТЬ: Сохраняем цвет для использования вне Shadow DOM ===
                    this.primaryColor = config.primary_color || '#4CAF50';
                    this.primaryColorRgb = this._hexToRgb(this.primaryColor); // Конвертируем для RGBA
                } else {
                    console.error("Не удалось загрузить конфиг маскота");
                    this.clientConfig = { primary_color: '#4CAF50', sprite_url: 'AllSprites.png' }; // Fallback
                }
            } catch (e) {
                this.clientConfig = { primary_color: '#4CAF50', sprite_url: 'AllSprites.png' };
            }
 
            this._createOverlayHost();
            this._renderWidget();
        }
 
        // === НОВЫЙ МЕТОД: Конвертация HEX в RGB для прозрачности ===
        _hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 76, g: 175, b: 80 }; // Fallback на зеленый
        }
 
        _createOverlayHost() {
            this.overlayHost = document.createElement('div');
            this.overlayHost.id = 'mascot-overlay-host';
            document.body.appendChild(this.overlayHost);
 
            const style = document.createElement('style');
            style.textContent = `
#mascot-overlay-host { pointer-events: none; z-index: 2147483647; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; }
.mascot-highlight-box { 
    position: absolute; 
    border: 4px solid ${this.primaryColor}; 
    background-color: rgba(${this.primaryColorRgb.r}, ${this.primaryColorRgb.g}, ${this.primaryColorRgb.b}, 0.15); 
    box-shadow: 0 0 20px rgba(${this.primaryColorRgb.r}, ${this.primaryColorRgb.g}, ${this.primaryColorRgb.b}, 0.5); 
    border-radius: 4px; 
    pointer-events: none; 
    animation: mascot-pulse 1.5s infinite; 
    transition: opacity 0.5s ease; 
    z-index: 2147483647; 
}
@keyframes mascot-pulse {  0% { box-shadow: 0 0 0 0 rgba(${this.primaryColorRgb.r}, ${this.primaryColorRgb.g}, ${this.primaryColorRgb.b}, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(${this.primaryColorRgb.r}, ${this.primaryColorRgb.g}, ${this.primaryColorRgb.b}, 0); } 100% { box-shadow: 0 0 0 0 rgba(${this.primaryColorRgb.r}, ${this.primaryColorRgb.g}, ${this.primaryColorRgb.b}, 0); } }
`;
            document.head.appendChild(style);
        }
 
 
        _generateUniqueSelector(el) {
             if (el.id) return `#${el.id}`;
             const testIds = ['data-testid', 'data-test-id', 'data-qa'];
             for (let attr of testIds) { if (el.hasAttribute(attr)) return `[${attr}="${el.getAttribute(attr)}"]`; }
             let path = [];
             while (el.nodeType === Node.ELEMENT_NODE) {
                 let selector = el.nodeName.toLowerCase();
                 if (el.id) { selector = '#' + el.id; path.unshift(selector); break; } 
                 else {
                     let sib = el, nth = 1;
                     while (sib = sib.previousElementSibling) { if (sib.nodeName.toLowerCase() == selector) nth++; }
                     if (nth != 1) selector += ":nth-of-type(" + nth + ")";
                 }
                 path.unshift(selector);
                 el = el.parentNode;
                 if (el.id === 'ai-mascot-widget-host') break; 
             }
             return path.join(" > ");
        }
 
 
        _renderWidget() {
            this.hostElement = document.createElement('div');
            this.hostElement.id = 'ai-mascot-widget-host';
            document.body.appendChild(this.hostElement);
 
            this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
 
            //const style = document.createElement('style');
            //style.textContent = WIDGET_CSS;
            //this.shadowRoot.appendChild(style);
 
            // --- ИНЖЕКТИМ ДИНАМИЧЕСКИЕ НАСТРОЙКИ В CSS ---
            const cfg = this.clientConfig;
            const corner  = cfg.position_corner || 'bottom-right';
            const bOffset = (cfg.position_bottom ?? 20) + 'px';
            const sOffset = (cfg.position_side   ?? 20) + 'px';
            const isTop   = corner.startsWith('top');
            const isLeft  = corner.endsWith('left');
 
            // Строим CSS-переопределение позиций на основе угла
            const vProp = isTop  ? 'top'  : 'bottom';
            const hProp = isLeft ? 'left' : 'right';
            const positionCSS = `
                :host {
                    ${vProp}: ${bOffset} !important;
                    ${hProp}: ${sOffset} !important;
                    ${isTop  ? 'bottom: auto !important;' : 'top: auto !important;'}
                    ${isLeft ? 'right: auto !important;'  : 'left: auto !important;'}
                }
                .mascot-wrapper {
                    ${vProp}: calc(${bOffset} + 50px) !important;
                    ${hProp}: calc(${sOffset} + 360px) !important;
                    ${isTop  ? 'bottom: auto !important;' : 'top: auto !important;'}
                    ${isLeft ? 'right: auto !important;'  : 'left: auto !important;'}
                }
                .chat-window-wrapper {
                    ${isLeft ? 'right: auto !important; left: 0 !important;' : 'left: auto !important; right: 0 !important;'}
                    ${isTop  ? 'bottom: auto !important; top: 80px !important;' : 'top: auto !important; bottom: 80px !important;'}
                }
            `;

// ───────────────────────────────────────────────────────────────────
// МОБИЛЬНЫЙ ОВЕРРАЙД ПОЗИЦИЙ (должен идти ПОСЛЕ positionCSS!)
// ───────────────────────────────────────────────────────────────────
// Проблема: positionCSS содержит !important для всех правил позиции.
// @media внутри WIDGET_CSS не может их переопределить, т.к. идёт раньше.
// Решение: добавляем mobileOverrideCSS в конец — он тоже имеет !important
// и побеждает по правилу "последнее определение при равной специфичности".
//
// Для каждого угла (corner) вычисляем:
//  — какая сторона вертикальная (top/bottom) и горизонтальная (left/right)
//  — оставляем тот же угол что выбрал admin, но обнуляем offset
//    и добавляем env(safe-area-inset-*) для учёта выреза/кнопки Home.
// mascot-wrapper на телефоне стоит НАД триггером, а не сбоку от чата.
// ───────────────────────────────────────────────────────────────────
// Облачко: CSS зависит от isLeft, поэтому вычисляем строку заранее —
// вложенные template literals внутри template literal вызывают SyntaxError.
const mobileBubbleCSS = isLeft
    // Левый угол: облачко ВПРАВО как на десктопе, хвостик слева
    ? `
    .mascot-speech-bubble {
        left: 90% !important;
        right: auto !important;
    }
    .mascot-speech-bubble::before {
        left: -12px !important;
        right: auto !important;
    }
    .mascot-speech-bubble::after {
        left: -28px !important;
        right: auto !important;
    }`
    // Правый угол: облачко ВЛЕВО (~40px левее спрайта), хвостик справа
    : `
    .mascot-speech-bubble {
        left: auto !important;
        right: 90% !important;
    }
    .mascot-speech-bubble::before {
        left: auto !important;
        right: -12px !important;
    }
    .mascot-speech-bubble::after {
        left: auto !important;
        right: -28px !important;
    }`;

const mobileOverrideCSS = `
@media (max-width: 600px) {
    :host {
        /*
         * Уважаем отступы из admin-панели (bOffset/sOffset), но ограничиваем
         * максимум в 40px — большой десктопный отступ не должен ломать мобиль.
         * env(safe-area-inset-*) суммируется поверх: защита от выреза/Home bar iPhone.
         *
         * Формула: safe-area + min(adminOffset, 40px)
         * Примеры: admin=20px → 20px+safe; admin=80px → 40px+safe
         */
        ${vProp}: calc(env(safe-area-inset-${vProp}, 0px) + min(${bOffset}, 80px)) !important;
        ${hProp}: calc(env(safe-area-inset-${hProp}, 0px) + min(${sOffset}, 80px)) !important;
        ${isTop  ? 'bottom: auto !important;' : 'top: auto !important;'}
        ${isLeft ? 'right: auto !important;'  : 'left: auto !important;'}
    }
    .mascot-wrapper {
        /* Позиционируем рядом с кнопкой-триггером (54px триггер + 10px зазор = 74px).
         * Горизонталь: тот же отступ что у триггера (с кепкой 40px). */
        ${vProp}: calc(env(safe-area-inset-${vProp}, 0px) + min(${bOffset}, 80px) + 74px) !important;
        ${hProp}: calc(env(safe-area-inset-${hProp}, 0px) + min(${sOffset}, 80px)) !important;
        ${isTop  ? 'bottom: auto !important;' : 'top: auto !important;'}
        ${isLeft ? 'right: auto !important;'  : 'left: auto !important;'}
        /* Понижаем z-index маскота — чат должен быть выше */
        z-index: 1000 !important;
    }
    .mascot-input-container {
        /* Нижние углы: инпут НАД маскотом. Верхние углы: инпут ПОД маскотом. */
        ${isTop
            ? 'top: calc(100% + 8px) !important; bottom: auto !important;'
            : 'bottom: calc(100% + 8px) !important; top: auto !important;'
        }
    }
    /* Позиция облачка — вычислена в mobileBubbleCSS выше */
    ${mobileBubbleCSS}
    .chat-window-wrapper {
        /* На мобильном — полноэкранный, позиция фиксированная,
           z-index выше маскота (1000) и триггера (500) */
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        z-index: 2000 !important;
    }
    .mascot-button-trigger {
        /* Понижаем до 500 — выше контента страницы, но ниже чата (2000) */
        z-index: 500 !important;
    }
}
`;

const dynamicCSS = WIDGET_CSS
    .replace('--mascot-primary-color: #4CAF50;', `--mascot-primary-color: ${cfg.primary_color};`)
    .replace("background-image: url('AllSprites.png');", `background-image: url('${cfg.sprite_url}');`)
    + positionCSS
    + mobileOverrideCSS;   // ← ключевое добавление
 
            // 2. Создаем элемент стиля и вставляем именно ДИНАМИЧЕСКИЙ текст
            const style = document.createElement('style');
            style.textContent = dynamicCSS; // ТЕПЕРЬ ПРАВИЛЬНО
            this.shadowRoot.appendChild(style);
 
            // 3. Рендерим HTML шаблон
            const template = document.createElement('template');
            template.innerHTML = WIDGET_HTML;
            this.shadowRoot.appendChild(template.content.cloneNode(true));
 
            // Привязываем элементы
            this.chatWindow = this.shadowRoot.getElementById('chat-window');
            
            this.mascotWrapper = this.shadowRoot.getElementById('mascot-wrapper');
            this.mascotSprite = this.shadowRoot.getElementById('mascot-sprite');
            
            this.mascotBubble = this.shadowRoot.getElementById('mascot-bubble');
            this.bubbleTextEl = this.shadowRoot.getElementById('bubble-text');
            
            this.miniInput = this.shadowRoot.getElementById('mini-input');
            this.miniSendBtn = this.shadowRoot.getElementById('mini-send');
 
            this._attachListeners();
            this._restoreHistoryUI();
            this._applyAutoOpen();
            console.log(`AI Mascot Widget запущен с цветом: ${this.clientConfig.primary_color}`);
        }
 
        _applyAutoOpen() {
            const mode  = this.clientConfig.auto_open  || 'manual';
            const delay = (this.clientConfig.auto_open_delay ?? 5) * 1000;
 
            if (mode === 'immediate') {
                // Небольшая пауза чтобы страница успела отрисоваться
                setTimeout(() => this._toggleMascotVisibility(true), 300);
            } else if (mode === 'delayed') {
                setTimeout(() => this._toggleMascotVisibility(true), delay);
            }
            // 'manual' — ничего не делаем, маскот откроется по кнопке
        }
 
        _restoreHistoryUI() {
            if (!this.history.length) return;
            const container = this.shadowRoot.getElementById('messages-container');
            this.history.forEach(msg => {
                const div = document.createElement('div');
                div.classList.add('message', msg.role === 'user' ? 'user' : 'mascot');
                div.textContent = msg.content;
                container.appendChild(div);
            });
            container.scrollTop = container.scrollHeight;
        }
 
        _attachListeners() {
            const trigger = this.shadowRoot.getElementById('mascot-trigger');
            const closeBtn = this.shadowRoot.getElementById('chat-close-btn');
            const input = this.shadowRoot.getElementById('chat-input');
            const sendBtn = this.shadowRoot.getElementById('send-button');
 
            // --- НОВАЯ КНОПКА открытия чата ---
            const openChatBtn = this.shadowRoot.getElementById('open-full-chat-btn');
            
            //trigger.addEventListener('click', () => this._toggleChat());
            // 1. Триггер теперь переключает ТОЛЬКО видимость маскота
            trigger.addEventListener('click', () => this._toggleMascotVisibility());
 
            // 2. Новая кнопка переключает (открывает/закрывает) окно чата
            openChatBtn.addEventListener('click', () => {
                const isChatOpen = this.chatWindow.classList.contains('is-open');
                this._toggleChatWindow(!isChatOpen);
            });
            
            //closeBtn.addEventListener('click', () => this._toggleChat(false));
            // 3. Кнопка "Закрыть" (крестик) закрывает ТОЛЬКО окно чата (маскот остается)
            closeBtn.addEventListener('click', () => this._toggleChatWindow(false));
 
            // Кнопка очистки истории
            const clearBtn = this.shadowRoot.getElementById('chat-clear-btn');
            clearBtn.addEventListener('click', () => {
                if (confirm('Очистить историю чата?')) this._clearHistory();
            });
 
            input.addEventListener('input', () => {
                sendBtn.disabled = input.value.trim() === '';
                this._autoResizeTextarea(input);
            });
 
            sendBtn.addEventListener('click', () => this._handleMessageSend(input));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this._handleMessageSend(input);
                }
            });
 
            this.shadowRoot.getElementById('action-bar').addEventListener('click', (e) => {
                if (e.target.classList.contains('action-button')) {
                    this._handleMessageSend(null, e.target.textContent);
                }
            });
            closeBtn.addEventListener('click', () => this._clearHighlights());
 
            this.miniSendBtn.addEventListener('click', () => {
                this._handleMessageSend(this.miniInput);
            });
            
            this.miniInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._handleMessageSend(this.miniInput);
            });
            
        }
 
 
        // --- Логика Чата и Контекста ---
 
        _addMessageToChat(sender, text) {
            const container = this.shadowRoot.getElementById('messages-container');
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', sender);
            messageDiv.textContent = text;
            container.appendChild(messageDiv);
            container.scrollTop = container.scrollHeight;
 
            // Не сохраняем приветственное сообщение маскота в историю
            if (sender === 'mascot' && this.history.length === 0) return;
 
            this.history.push({ role: sender === 'user' ? 'user' : 'assistant', content: text });
            if (this.history.length > this.MAX_HISTORY) this.history.shift();
 
            // Сохраняем в sessionStorage
            try { sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.history)); }
            catch(e) { /* игнорируем ошибки квоты */ }
        }
 
        _clearHistory() {
            this.history = [];
            try { sessionStorage.removeItem(this.STORAGE_KEY); } catch(e) {}
            const container = this.shadowRoot.getElementById('messages-container');
            // Оставляем только первое приветственное сообщение
            const messages = container.querySelectorAll('.message');
            messages.forEach((el, i) => { if (i > 0) el.remove(); });
        }
 
        _autoResizeTextarea(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        }
        
 
_getDOMContext() {
    const items = [];
    const seenTexts = new Set(); // Защита от дублей
 
    // --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ---
    const addItem = (type, text, selector, importance) => {
        if (!text || text.length < 2 || text.length > 150) return;
        if (seenTexts.has(text)) return; // Игнорируем дубли
        items.push({ type, text: text.trim(), selector, importance });
        seenTexts.add(text);
    };
 
    // 1. Заголовки (Приоритет 10)
    document.querySelectorAll('h1, h2, h3, h4').forEach(el => {
        if (!this._isVisible(el)) return;
        addItem('header', el.innerText, this._generateUniqueSelector(el), 10);
    });
 
    // 2. Навигация (Приоритет 9)
    document.querySelectorAll('nav a, header a, [role="menu"] a').forEach(el => {
        if (!this._isVisible(el)) return;
        const text = el.innerText || el.getAttribute('aria-label');
        addItem('nav', text, this._generateUniqueSelector(el), 9);
    });
 
    // 3. Интерактивные элементы (Приоритет 8)
    document.querySelectorAll('button, a[href], input[type="submit"], [role="button"]').forEach(el => {
        if (!this._isVisible(el)) return;
        const text = el.getAttribute('aria-label') || el.innerText || el.value || '';
        addItem('interactive', text, this._generateUniqueSelector(el), 8);
        
        // === НОВОЕ: Сканируем детей интерактивных элементов ===
        // Если внутри кнопки есть span с классом .btn-text, .label, .price — добавляем отдельно
        el.querySelectorAll('span, .price, .label, .badge').forEach(child => {
            if (!this._isVisible(child)) return;
            const childText = child.innerText.trim();
            // Добавляем только если текст отличается от родителя (например, цена отдельно)
            if (childText && childText !== text && !text.includes(childText)) {
                const classes = child.className ? '.' + child.className.split(' ').join('.') : '';
                addItem('interactive_child', `${childText}`, 
                       this._generateUniqueSelector(el) + ' ' + child.tagName.toLowerCase() + classes, 7);
            }
        });
    });
 
    // 4. Семантические разделы (Приоритет 7)
    document.querySelectorAll('section, article, .card, .item, form, [role="region"]').forEach(el => {
        if (!this._isVisible(el)) return;
        const title = el.querySelector('h1, h2, h3, h4')?.innerText || el.getAttribute('aria-label');
        if (title) {
            addItem('section', `Раздел: ${title}`, this._generateUniqueSelector(el), 7);
        }
    });
 
    // 5. === ИСПРАВЛЕНО: Span и важный контент (Приоритет 6) ===
    // Собираем span с важными классами ИЛИ span с уникальным текстом
    document.querySelectorAll('span.price, span.title, span.label, span.badge, span.tag, .description, .price, .amount').forEach(el => {
        if (!this._isVisible(el)) return;
        const text = el.innerText.trim();
        if (text.length > 2 && text.length < 100) {
            addItem('content', text, this._generateUniqueSelector(el), 6);
        }
    });
 
    // 6. Обычный контент (Приоритет 5)
    // Убрали span отсюда, чтобы не дублировать с пунктом 5
    document.querySelectorAll('p, li, figcaption').forEach(el => {
        if (!this._isVisible(el)) return;
        const text = el.innerText.trim();
        if (text.length > 15 && text.length < 200) {
            if (!seenTexts.has(text)) {
                addItem('content', text, this._generateUniqueSelector(el), 5);
            }
        }
    });
 
    // 7. Картинки (Приоритет 6)
    document.querySelectorAll('img[alt]').forEach(el => {
        if (!this._isVisible(el) || el.width < 50) return;
        addItem('image', `Изображение: ${el.alt}`, this._generateUniqueSelector(el), 6);
    });
 
    // 8. Поля ввода (Приоритет 8 — важны для FILL_INPUT)
    document.querySelectorAll('input, textarea, select').forEach(el => {
        if (!this._isVisible(el)) return;
 
        const type      = (el.getAttribute('type') || 'text').toLowerCase();
        const skipTypes = ['submit', 'button', 'reset', 'checkbox', 'radio', 'hidden', 'file', 'image'];
        if (skipTypes.includes(type)) return;
 
        // Определяем понятный тип поля
        let fieldKind = 'текстовое поле';
        if (el.tagName === 'TEXTAREA')                         fieldKind = 'многострочное поле';
        else if (el.tagName === 'SELECT')                      fieldKind = 'выпадающий список';
        else if (type === 'search')                            fieldKind = 'поле поиска';
        else if (type === 'tel')                               fieldKind = 'поле телефона';
        else if (type === 'email')                             fieldKind = 'поле email';
        else if (type === 'number')                            fieldKind = 'числовое поле';
        else if (type === 'password')                          fieldKind = 'поле пароля';
        else if (type === 'date' || type === 'datetime-local') fieldKind = 'поле даты';
 
        // Ищем подпись к полю: label, aria-label, placeholder, name
        const id          = el.getAttribute('id');
        const labelEl     = id ? document.querySelector(`label[for="${id}"]`) : null;
        const labelText   = labelEl?.innerText?.trim()
                         || el.getAttribute('aria-label')
                         || el.getAttribute('placeholder')
                         || el.getAttribute('name')
                         || '';
 
        const description = labelText
            ? `${fieldKind}: "${labelText}"`
            : fieldKind;
 
        addItem('input', description, this._generateUniqueSelector(el), 8);
    });
 
    // Сортировка и лимит
    items.sort((a, b) => b.importance - a.importance);
    return items.slice(0, 70);  // Увеличили лимит чуть из-за новых полей
}
 
// Проверка видимости
_isVisible(el) {
    if (!el || el.offsetParent === null) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}
        
       /* _getDOMContext() {
            const items = [];
            const headers = document.querySelectorAll('h1, h2, h3');
            headers.forEach(el => {
                if (el.offsetParent === null) return;
                items.push({ type: 'header', text: el.innerText.trim(), selector: this._generateUniqueSelector(el), importance: 10 });
            });
            const interactive = document.querySelectorAll('button, a[href], input[type="submit"], [role="button"]');
            interactive.forEach(el => {
                if (el.offsetParent === null) return;
                const text = el.innerText || el.getAttribute('aria-label') || el.value || '';
                if (text.length < 2) return;
                items.push({ type: 'interactive', text: text.slice(0, 50).trim(), selector: this._generateUniqueSelector(el), tag: el.tagName.toLowerCase(), importance: 8 });
            });
            const contentElements = document.querySelectorAll('p, span, div, article, li');
            contentElements.forEach(el => {
                if (el.offsetParent === null) return;
                const text = el.innerText.trim();
                if (text.length > 20 && text.length < 300 && el.children.length === 0) {
                    items.push({ type: 'content', text: text, selector: this._generateUniqueSelector(el), importance: 5 });
                }
            });
            const images = document.querySelectorAll('img[alt]');
            images.forEach(el => {
                if (el.offsetParent === null || el.width < 50) return;
                items.push({ type: 'image', text: `Изображение: ${el.alt}`, selector: this._generateUniqueSelector(el), importance: 6 });
            });
            items.sort((a, b) => b.importance - a.importance);
            return items.slice(0, 70);
        }*/
 
        // --- УПРАВЛЕНИЕ АНИМАЦИЯМИ МАСКОТА ---
 
        /**
         * Устанавливает состояние анимации маскота.
         * @param {string} state - 'idle', 'waving', 'running', 'thinking', 'pointing'.
         * @param {number} duration - Время в мс, через которое вернуться в 'idle'. Если 0, не возвращается.
         */
        _setMascotState(state, duration = 0) {
            if (this.animationTimeout) {
                clearTimeout(this.animationTimeout);
                this.animationTimeout = null;
            }
 
            // УДАЛЕНИЕ ВСЕХ ВОЗМОЖНЫХ КЛАССОВ СОСТОЯНИЙ
            this.mascotSprite.classList.remove(
                'is-idle', 
                'is-waving', 
                'is-running', 
                'is-thinking', 
                'is-pointing'
            );
            
            this.mascotSprite.classList.add(`is-${state}`);
 
            if (duration > 0 && state !== 'idle') {
                this.animationTimeout = setTimeout(() => {
                    this._setMascotState('idle');
                }, duration);
            }
        }
 
 
        // --- Главная Логика AI (API Call + Streaming) ---
 
        async _handleMessageSend(inputElement, actionText = null) {
            let message = actionText;
 
            if (inputElement) {
                message = inputElement.value.trim();
                if (!message) return;
                inputElement.value = '';
                this.shadowRoot.getElementById('send-button').disabled = true;
                this._autoResizeTextarea(inputElement);
            }
            if (!message) return;
 
            this._addMessageToChat('user', message);
            this._clearHighlights();
 
            this.mascotBubble.classList.add('is-active');
            this.bubbleTextEl.textContent = "Анализирую контекст...";
            this._setMascotState('thinking');
 
            const requestPayload = {
                user_message: message,
                page_context: this._getDOMContext(),
                chat_history: this.history,
                session_id: this.sessionId,
                page_url: window.location.href.slice(0, 500),
            };
 
            try {
                const response = await fetch(this.AI_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream',   // запрашиваем стриминг
                    },
                    body: JSON.stringify(requestPayload),
                });
 
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
 
                const contentType = response.headers.get('Content-Type') || '';
 
                // ── Стриминговый путь ──────────────────────────────────────────
                if (contentType.includes('text/event-stream')) {
                    await this._handleStreamResponse(response);
 
                // ── Обычный JSON (fallback) ────────────────────────────────────
                } else {
                    const data = await response.json();
                    this._applyAIResponse(data.response_text, data.action);
                }
 
            } catch (error) {
                this.bubbleTextEl.textContent = "Ошибка связи.";
                this._addMessageToChat('mascot', 'Ошибка связи с сервером.');
                this._setMascotState('idle');
                console.error('AI Mascot error:', error);
                setTimeout(() => this.mascotBubble.classList.remove('is-active'), 2000);
            }
        }
 
        /**
         * Читает NDJSON-стрим от сервера и выводит текст по мере поступления.
         * Каждая строка — JSON-объект:
         *   {"chunk": "текст..."}          — кусок текста
         *   {"done": true, "action": ...}  — конец стрима, содержит action
         *   {"error": "..."}               — ошибка
         */
        async _handleStreamResponse(response) {
            const reader  = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
 
            // Добавляем пустой пузырь, в который будем дописывать текст
            const msgEl = this._createStreamingMessage();
            let fullText = '';
            let buffer   = '';
 
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
 
                    buffer += decoder.decode(value, { stream: true });
 
                    // Разбиваем буфер по переносам строки (NDJSON)
                    const lines = buffer.split('\n');
                    buffer = lines.pop(); // последняя неполная строка остаётся в буфере
 
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
 
                        try {
                            const parsed = JSON.parse(trimmed);
 
                            if (parsed.chunk) {
                                // Дописываем кусок текста в сообщение
                                fullText += parsed.chunk;
                                // Показываем только текстовую часть (до JSON-структуры)
                                // Gemini в JSON-режиме стримит сырой JSON — показываем как есть,
                                // финальный парсинг сделает _applyAIResponse
                                msgEl.textContent = this._extractTextFromPartialJson(fullText);
                                this.bubbleTextEl.textContent = msgEl.textContent.slice(0, 60) + '…';
                                msgEl.scrollIntoView({ block: 'end', behavior: 'smooth' });
                            }
 
                            if (parsed.done) {
                                // Стрим завершён — применяем action
                                const finalText = this._extractTextFromPartialJson(fullText);
                                msgEl.textContent = finalText;
                                this.bubbleTextEl.textContent = finalText;
                                // Добавляем в историю и сохраняем в sessionStorage
                                this.history.push({ role: 'assistant', content: finalText });
                                if (this.history.length > this.MAX_HISTORY) this.history.shift();
                                try { sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.history)); }
                                catch(e) {}
                                this._executeAction(parsed.action);
                            }
 
                            if (parsed.error) {
                                msgEl.textContent = parsed.error;
                                this.bubbleTextEl.textContent = parsed.error;
                                this._setMascotState('idle');
                            }
 
                        } catch (_) { /* неполная строка — пропускаем */ }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        }
 
        /**
         * Пытается извлечь поле response_text из частично накопленного JSON.
         * Если JSON ещё не полный — возвращает сырую строку как есть.
         */
        _extractTextFromPartialJson(raw) {
            try {
                const parsed = JSON.parse(raw);
                return parsed.response_text || raw;
            } catch (_) {
                // JSON ещё неполный — ищем уже написанный кусок response_text
                const match = raw.match(/"response_text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                return match ? match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
            }
        }
 
        /** Создаёт пустой DOM-элемент сообщения маскота для стримингового наполнения. */
        _createStreamingMessage() {
            const container = this.shadowRoot.getElementById('messages-container');
            const div = document.createElement('div');
            div.classList.add('message', 'mascot');
            div.textContent = '';
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;
            return div;
        }
 
        /** Применяет финальный ответ (текст + action). Используется в не-стриминговом пути. */
        _applyAIResponse(text, action) {
            this._addMessageToChat('mascot', text);
            this.bubbleTextEl.textContent = text;
            this._executeAction(action);
        }
 
        /** Выполняет action (HIGHLIGHT / NAVIGATE / FILL_INPUT / FILL_INPUTS) или переходит в idle. */
        _executeAction(action) {
            if (action && action.type === 'FILL_INPUTS' && Array.isArray(action.fields) && action.fields.length) {
                this._fillInputsSequential(action.fields);
            } else if (action && action.selector) {
                if (action.type === 'HIGHLIGHT') {
                    this.highlightElement(action.selector);
                } else if (action.type === 'NAVIGATE') {
                    this._navigateToElement(action.selector);
                } else if (action.type === 'FILL_INPUT') {
                    this._fillInput(action.selector, action.value || '');
                }
            } else {
                this._setMascotState('idle');
                setTimeout(() => this.mascotBubble.classList.remove('is-active'), 5000);
            }
        }
 
        /** Вставляет значение в DOM-элемент (совместимо с React/Vue). */
        _setInputValue(el, value) {
            // Фокусируемся ПЕРВЫМ — inputmask библиотеки устанавливают маску в el.value
            // именно при фокусе, поэтому читаем el.value уже после него
            el.focus();
 
            // Небольшая пауза чтобы inputmask успел отработать синхронно
            const finalValue = this._preparePhoneValue(el, value);
 
            const proto = el.tagName === 'INPUT'    ? window.HTMLInputElement.prototype
                        : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
                        : null;
            const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
            if (setter) setter.set.call(el, finalValue);
            else el.value = finalValue;
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
 
        /**
         * Подготавливает номер телефона под маску конкретного поля.
         * Смотрит на placeholder/маску и обрезает лишний префикс если поле его не ожидает.
         */
        _preparePhoneValue(el, value) {
            const type = (el.getAttribute('type') || '').toLowerCase();
            if (type !== 'tel') return value;
 
            // Собираем подсказки — placeholder надёжнее el.value
            // (inputmask ставит el.value асинхронно, поэтому не полагаемся на него)
            // el.value уже содержит маску если используется inputmask (focus вызван раньше)
            const hints = [
                el.getAttribute('placeholder') || '',
                el.getAttribute('data-mask')   || '',
                el.getAttribute('data-format') || '',
                el.getAttribute('data-phonemask') || '',
                el.value || '',   // inputmask уже вставил шаблон типа "+7 (___) ___-__-__"
            ].join(' ');
 
            // Убираем все нецифровые символы из ввода пользователя
            const digits = value.split('').filter(c => c >= '0' && c <= '9').join('');
 
            // Нормализуем до 10 местных цифр (убираем код страны 7 или 8)
            let local10 = digits;
            if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) {
                local10 = digits.slice(1);
            }
 
            // Определяем формат поля (+7 может быть с пробелом: '+ 7')
            if (hints.includes('+7') || hints.includes('+ 7')) return '+7' + local10;
            if (/(?:^|[^+0-9])8/.test(hints)) return '8' + local10;
 
            // Маска без кода страны: считаем количество заполнителей (_)
            // Обрезаем код только если в маске ровно 10 слотов и у пользователя 11 цифр
            const maskSlots = (hints.match(/_/g) || []).length;
            if (maskSlots === 10 && digits.length === 11
                && (digits[0] === '7' || digits[0] === '8')) {
                return local10;
            }
 
            // Во всех остальных случаях — вставляем как написал пользователь
            return value;
        }
 
        /** Заполняет одно поле с анимацией бега маскота. Возвращает Promise. */
        /** Заполняет одно поле с анимацией бега маскота. Возвращает Promise. */
        _fillInput(selector, value) {
            return new Promise((resolve) => {
                try {
                    const el = document.querySelector(selector);
                    if (!el) { this._setMascotState('idle'); resolve(); return; }
 
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    this._clearHighlights();
                    this.mascotWrapper.classList.add('is-visible');
 
                    // Баг 2: сбрасываем transform ПЕРЕД вычислением позиции,
                    // иначе getBoundingClientRect вернёт смещённую точку
                    this.mascotWrapper.classList.remove('is-moving');
                    this.mascotWrapper.style.transform = '';
 
                    setTimeout(() => {
                        const targetRect = el.getBoundingClientRect();
                        const mascotRect = this.mascotWrapper.getBoundingClientRect();
 
                        // Ограничиваем движение чтобы маскот не уходил за край экрана
                        const rawDeltaX = targetRect.left - mascotRect.left - 100;
                        const rawDeltaY = (targetRect.top + targetRect.height / 2)
                                        - (mascotRect.top + mascotRect.height / 2);
 
                        const vw = window.innerWidth;
                        const vh = window.innerHeight;
                        const mw = mascotRect.width;
                        const mh = mascotRect.height;
 
                        const minX = -mascotRect.left + 10;              // не уходим левее 10px
                        const maxX = vw - mascotRect.right - 10;         // не уходим правее vw
                        const minY = -mascotRect.top + 10;               // не выше 10px
                        const maxY = vh - mascotRect.bottom - 10;        // не ниже vh
 
                        const deltaX = Math.max(minX, Math.min(maxX, rawDeltaX));
                        const deltaY = Math.max(minY, Math.min(maxY, rawDeltaY));
 
                        this.mascotWrapper.classList.add('is-moving');
                        this._setMascotState('running');
                        this.mascotWrapper.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
 
                        // Прибежали — вставляем значение
                        setTimeout(() => {
                            this._setMascotState('pointing');
                            this._drawHighlightBox(el.getBoundingClientRect());
                            this._setInputValue(el, value);
 
                            // Возвращаемся на базу
                            setTimeout(() => {
                                this._clearHighlights();
                                this.mascotWrapper.classList.add('is-moving');
                                this._setMascotState('running');
                                this.mascotWrapper.style.transform = 'translate(0px, 0px)';
 
                                setTimeout(() => {
                                    this.mascotWrapper.classList.remove('is-moving');
                                    this.mascotWrapper.style.transform = '';
                                    // Баг 1: ставим idle и убираем облачко — нужно и для одиночного FILL_INPUT
                                    this._setMascotState('idle');
                                    this.mascotBubble.classList.remove('is-active');
                                    resolve();
                                }, 1200);
                            }, 1500);
                        }, 1500);
                    }, 700); // немного больше чтобы scrollIntoView успел завершиться
 
                } catch(e) {
                    console.error('FILL_INPUT error:', e);
                    this._setMascotState('idle');
                    resolve();
                }
            });
        }
 
        /** Заполняет несколько полей последовательно. */
        async _fillInputsSequential(fields) {
            for (const field of fields) {
                await this._fillInput(field.selector, field.value || '');
            }
            // После всех полей — idle
            this._setMascotState('idle');
            this.mascotBubble.classList.remove('is-active');
        }
 
        _hideBubbleText() {
            this.bubbleTextEl.classList.remove('has-text');
            this.bubbleTextEl.textContent = '';
        }
 
        // --- Логика Подсветки и Перемещения ---
 
        highlightElement(selector) {
            this._clearHighlights();
            
            this.mascotWrapper.classList.add('is-visible');
 
            try {
                const targetElement = document.querySelector(selector);
                if (!targetElement) return;
 
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
 
                setTimeout(() => {
                    const targetRect = targetElement.getBoundingClientRect();
                    const mascotRect = this.mascotWrapper.getBoundingClientRect();
 
                    const deltaX = targetRect.left - mascotRect.left - 150; 
                    const deltaY = (targetRect.top + targetRect.height / 2) - (mascotRect.top + mascotRect.height / 2);
 
                    this.mascotWrapper.classList.add('is-moving');
                    this._setMascotState('running');
 
                    this.mascotWrapper.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                    
                    // КОГДА ПРИБЕЖАЛ (2 сек)
                    setTimeout(() => {
 
                        // === ВАЖНО: Пересчитываем rect перед подсветкой! ===
                        // Элемент мог сместиться из-за скролла/анимаций
                        const finalRect = targetElement.getBoundingClientRect();
                        
                        // === ИЗМЕНЕНИЕ: Используем "Указание" (Pointing) вместо Waving ===
                        this._setMascotState('pointing'); 
 
                        this.mascotBubble.classList.add('is-active');
                        this._drawHighlightBox(finalRect);
 
                        // ВОЗВРАТ НА БАЗУ (4 сек показа)
                        setTimeout(() => {
                            this._clearHighlights();
                            this.mascotBubble.classList.remove('is-active');
                            
                            this._setMascotState('running');
                            this.mascotWrapper.style.transform = 'translate(0px, 0px)';
                            
                            setTimeout(() => {
                                this.mascotWrapper.classList.remove('is-moving'); 
                                this.mascotWrapper.style.transform = ''; 
                                this._setMascotState('idle'); 
 
                            }, 2000);
 
                        }, 4000); 
 
                    }, 2000); 
 
                }, 800); 
 
            } catch (e) {
                console.error("Ошибка перемещения:", e);
                this._setMascotState('idle');
            }
        }
        
 
        _drawHighlightBox(rect) {
            const highlightBox = document.createElement('div');
            highlightBox.classList.add('mascot-highlight-box');
            
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            
            highlightBox.style.width = `${rect.width + 10}px`;
            highlightBox.style.height = `${rect.height + 10}px`;
            highlightBox.style.top = `${rect.top - 5}px`;
            highlightBox.style.left = `${rect.left - 5}px`;
            
            this.overlayHost.appendChild(highlightBox);
            
            requestAnimationFrame(() => { highlightBox.style.opacity = '1'; });
        }
        
 
        _clearHighlights() {
            this.overlayHost.innerHTML = '';
        }
 
 
        _navigateToElement(selector) {
            this._clearHighlights();
            this.mascotWrapper.classList.add('is-visible');
 
            try {
                const targetElement = document.querySelector(selector);
                if (!targetElement) {
                    this._addMessageToChat('mascot', 'Ой, не могу найти кнопку для перехода.');
                    return;
                }
 
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
 
                setTimeout(() => {
                    const targetRect = targetElement.getBoundingClientRect();
                    const mascotRect = this.mascotWrapper.getBoundingClientRect();
 
                    // Бежим чуть левее элемента
                    const deltaX = targetRect.left - mascotRect.left - 100; 
                    const deltaY = (targetRect.top + targetRect.height / 2) - (mascotRect.top + mascotRect.height / 2);
 
                    this.mascotWrapper.classList.add('is-moving');
                    this._setMascotState('running');
                    this.mascotWrapper.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
 
                    // Когда добежал
                    setTimeout(() => {
                        this._setMascotState('pointing');
                        
                        // Эмуляция клика для перехода
                        setTimeout(() => {
                            targetElement.click();
 
                            // Якорная ссылка (#section) — страница не перезагружается,
                            // возвращаем маскота в исходное положение вручную
                            const href = targetElement.getAttribute('href') || '';
                            const isAnchor = href.startsWith('#') ||
                                (targetElement.tagName === 'A' && targetElement.href &&
                                 new URL(targetElement.href).pathname === window.location.pathname &&
                                 new URL(targetElement.href).hash !== '');
 
                            if (isAnchor) {
                                // Ждём пока скролл завершится, потом бежим обратно
                                setTimeout(() => {
                                    this.mascotWrapper.classList.add('is-moving');
                                    this._setMascotState('running');
                                    this.mascotWrapper.style.transform = 'translate(0px, 0px)';
                                    setTimeout(() => {
                                        this.mascotWrapper.classList.remove('is-moving');
                                        this.mascotWrapper.style.transform = '';
                                        this._setMascotState('idle');
                                        // Скрываем облачко
                                        this.mascotBubble.classList.remove('is-active');
                                    }, 1500);
                                }, 600);
                            } else if (targetElement.tagName === 'A' && targetElement.href) {
                                // Внешняя ссылка — переходим
                                window.location.href = targetElement.href;
                            }
                        }, 500);
 
                    }, 2000); // Время бега
 
                }, 800); 
 
            } catch (e) {
                console.error("Ошибка навигации:", e);
                this._setMascotState('idle');
            }
        }
        
 
        /*_toggleChat(force) {
            this.isOpen = force !== undefined ? force : !this.isOpen;
            this.chatWindow.classList.toggle('is-open', this.isOpen);
 
            this.mascotWrapper.classList.toggle('is-visible', this.isOpen);
            
            if (this.isOpen) {
                this.shadowRoot.getElementById('chat-input').focus();
                this._setMascotState('waving', 2000);
            } else {
                this._clearHighlights();
                this._setMascotState('idle');
            }
        }*/
 
        // Управляет только появлением маскота
        _toggleMascotVisibility(force) {
            this.isOpen = force !== undefined ? force : !this.isOpen;
            
            this.mascotWrapper.classList.toggle('is-visible', this.isOpen);
            
            if (this.isOpen) {
                this._setMascotState('waving', 2000);
            } else {
                // Если скрываем маскота полностью — скрываем и чат
                this._toggleChatWindow(false);
                this._clearHighlights();
                this._setMascotState('idle');
            }
        }
 
        // Управляет только окном чата
        _toggleChatWindow(show) {
            this.isOpen = show !== undefined ? show : !this.isOpen;
            this.chatWindow.classList.toggle('is-open', show);
            if (show) {
                this.shadowRoot.getElementById('chat-input').focus();
            }
        }
    }
 
    // ------------------------------------------------------------------
    // 4. Точка входа
    // ------------------------------------------------------------------
    function initializeMascotWidget() {
        const mascotScript = document.getElementById('mascot-script');
        // data-api-url позволяет подключить виджет к любому серверу без редактирования JS.
        // Если атрибут не задан — берём origin скрипта (src).
        const scriptSrc  = mascotScript ? mascotScript.src : '';
        const defaultBase = scriptSrc ? new URL(scriptSrc).origin : window.location.origin;
        const apiUrl = mascotScript
            ? (mascotScript.getAttribute('data-api-url') || defaultBase)
            : defaultBase;
        window.MascotWidgetInstance = new MascotWidget(apiUrl);
    }
 
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeMascotWidget);
    } else {
        initializeMascotWidget();
    }
 
})();