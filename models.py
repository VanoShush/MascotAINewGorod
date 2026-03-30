from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class AppConfig(db.Model):
    """
    Единственная запись конфигурации приложения.
    Создаётся автоматически при первом запуске (см. app.py).
    Управляется через панель /admin.
    """
    __tablename__ = 'app_config'

    id                   = db.Column(db.Integer,    primary_key=True)
    primary_color        = db.Column(db.String(20),  default='#4CAF50')
    sprite_url           = db.Column(db.String(500), default='AllSprites.png')
    system_prompt        = db.Column(db.Text,        default='Ты — ассистент.')
    position_corner      = db.Column(db.String(20),  default='bottom-right')
    position_bottom      = db.Column(db.Integer,     default=20)
    position_side        = db.Column(db.Integer,     default=20)
    auto_open            = db.Column(db.String(20),  default='manual')
    auto_open_delay      = db.Column(db.Integer,     default=5)
    catalog_api_url      = db.Column(db.Text,        default='')
    catalog_api_params   = db.Column(db.Text,        default='')
    catalog_api_response = db.Column(db.Text,        default='')

    def __repr__(self):
        return f"<AppConfig id={self.id}>"


class AllowedDomain(db.Model):
    """
    Разрешённые домены для CORS и проверки Origin.
    Заменяет ClientDomain — без привязки к client_id.
    Управляется через панель /admin.
    """
    __tablename__ = 'allowed_domains'

    id     = db.Column(db.Integer,     primary_key=True)
    domain = db.Column(db.String(255), nullable=False, unique=True)

    def __repr__(self):
        return f"<AllowedDomain {self.domain}>"


class ClientKnowledgeChunk(db.Model):
    """
    Чанк текстового документа базы знаний.
    Без привязки к client_id — единственная общая база знаний.
    """
    __tablename__ = 'client_knowledge_chunks'

    id              = db.Column(db.Integer, primary_key=True)
    source_filename = db.Column(db.String(255), nullable=False)
    chunk_index     = db.Column(db.Integer,     nullable=False)
    chunk_text      = db.Column(db.Text,        nullable=False)
    embedding       = db.Column(db.JSON,        nullable=True)

    __table_args__ = (
        db.Index('ix_knowledge_chunk_index', 'chunk_index'),
    )

    def __repr__(self):
        return f"<KnowledgeChunk id={self.id} idx={self.chunk_index}>"


class ChatLog(db.Model):
    """
    Лог диалогов. Без привязки к client_id.
    Используется для аналитики через /admin.
    """
    __tablename__ = 'chat_logs'

    id           = db.Column(db.Integer, primary_key=True)
    session_id   = db.Column(db.String(64),  nullable=True,  index=True)
    page_url     = db.Column(db.Text,        nullable=True)
    user_message = db.Column(db.Text,        nullable=False)
    bot_response = db.Column(db.Text,        nullable=True)
    action_type  = db.Column(db.String(20),  nullable=True)
    created_at   = db.Column(db.DateTime,    nullable=False,
                             default=db.func.now(), index=True)

    def __repr__(self):
        return f"<ChatLog id={self.id}>"