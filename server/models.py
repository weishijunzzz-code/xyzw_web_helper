from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db
import json


class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    authorized_until = db.Column(db.DateTime, nullable=True)
    max_tokens = db.Column(db.Integer, default=3)
    can_schedule_tasks = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)

    tokens = db.relationship('GameToken', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    configs = db.relationship('UserConfig', backref='user', lazy='dynamic', cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def is_authorized(self):
        if not self.is_active:
            return False
        if self.is_admin:
            return True
        if self.authorized_until is None:
            return False
        now = datetime.utcnow()
        auth_until = self.authorized_until
        if auth_until.tzinfo is not None:
            from datetime import timezone
            auth_until = auth_until.astimezone(timezone.utc).replace(tzinfo=None)
        return now < auth_until

    def can_use_scheduled_tasks(self):
        if self.is_admin:
            return True
        return self.can_schedule_tasks and self.is_authorized()

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'isAdmin': self.is_admin,
            'isActive': self.is_active,
            'authorizedUntil': self.authorized_until.isoformat() if self.authorized_until else None,
            'isAuthorized': self.is_authorized(),
            'maxTokens': self.max_tokens,
            'canScheduleTasks': self.can_schedule_tasks,
            'canUseScheduledTasks': self.can_use_scheduled_tasks(),
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'lastLogin': self.last_login.isoformat() if self.last_login else None
        }

    def __repr__(self):
        return f'<User {self.username}>'


class GameToken(db.Model):
    __tablename__ = 'game_tokens'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    token_id = db.Column(db.String(100), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    token = db.Column(db.Text, nullable=False)
    ws_url = db.Column(db.Text, nullable=True)
    server = db.Column(db.String(50), nullable=True)
    remark = db.Column(db.Text, nullable=True)
    import_method = db.Column(db.String(20), nullable=True)
    source_url = db.Column(db.Text, nullable=True)
    avatar = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    sort_order = db.Column(db.Integer, default=0)
    service_expiry = db.Column(db.DateTime, nullable=True)
    extra_data = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'token_id', name='unique_user_token'),
    )

    def to_dict(self):
        extra = {}
        if self.extra_data:
            try:
                extra = json.loads(self.extra_data)
            except:
                pass
        return {
            'id': self.token_id,
            'name': self.name,
            'token': self.token,
            'wsUrl': self.ws_url,
            'server': self.server,
            'remark': self.remark,
            'importMethod': self.import_method,
            'sourceUrl': self.source_url,
            'avatar': self.avatar,
            'isActive': self.is_active,
            'sortOrder': self.sort_order,
            'serviceExpiry': self.service_expiry.isoformat() if self.service_expiry else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            **extra
        }

    def from_dict(self, data):
        self.token_id = data.get('id', data.get('tokenId', f'token_{datetime.now().timestamp()}'))
        self.name = data.get('name', 'Unknown')
        self.token = data.get('token', '')
        self.ws_url = data.get('wsUrl', data.get('ws_url'))
        self.server = data.get('server')
        self.remark = data.get('remark')
        self.import_method = data.get('importMethod', data.get('import_method'))
        self.source_url = data.get('sourceUrl', data.get('source_url'))
        self.avatar = data.get('avatar')
        self.is_active = data.get('isActive', data.get('is_active', True))
        self.sort_order = data.get('sortOrder', data.get('sort_order', 0))

        if 'serviceExpiry' in data or 'service_expiry' in data:
            expiry = data.get('serviceExpiry') or data.get('service_expiry')
            if expiry:
                if isinstance(expiry, str):
                    try:
                        self.service_expiry = datetime.fromisoformat(expiry.replace('Z', '+00:00'))
                    except:
                        self.service_expiry = None
                elif isinstance(expiry, datetime):
                    self.service_expiry = expiry

        extra_fields = {}
        for key in ['level', 'profession', 'lastUsed']:
            if key in data:
                extra_fields[key] = data[key]
        if extra_fields:
            self.extra_data = json.dumps(extra_fields)

    def __repr__(self):
        return f'<GameToken {self.name}>'


class UserConfig(db.Model):
    __tablename__ = 'user_configs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    config_key = db.Column(db.String(100), nullable=False)
    config_value = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'config_key', name='unique_user_config'),
    )

    def to_dict(self):
        return {
            'key': self.config_key,
            'value': self.config_value
        }

    def __repr__(self):
        return f'<UserConfig {self.config_key}>'


class TokenGroup(db.Model):
    __tablename__ = 'token_groups'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    group_id = db.Column(db.String(100), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    color = db.Column(db.String(20), default='#1677ff')
    token_ids = db.Column(db.Text, default='[]')
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'group_id', name='unique_user_group'),
    )

    def to_dict(self):
        token_ids = []
        if self.token_ids:
            try:
                token_ids = json.loads(self.token_ids)
            except:
                pass
        return {
            'id': self.group_id,
            'name': self.name,
            'color': self.color,
            'tokenIds': token_ids,
            'sortOrder': self.sort_order,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

    def from_dict(self, data):
        self.group_id = data.get('id', f'group_{datetime.now().timestamp()}')
        self.name = data.get('name', 'New Group')
        self.color = data.get('color', '#1677ff')
        self.token_ids = json.dumps(data.get('tokenIds', data.get('token_ids', [])))
        self.sort_order = data.get('sortOrder', data.get('sort_order', 0))

    def __repr__(self):
        return f'<TokenGroup {self.name}>'


class ScheduledTask(db.Model):
    __tablename__ = 'scheduled_tasks'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    task_id = db.Column(db.String(100), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    run_type = db.Column(db.String(20), default='daily')
    run_time = db.Column(db.String(10), nullable=True)
    cron_expression = db.Column(db.String(50), nullable=True)
    selected_tokens = db.Column(db.Text, default='[]')
    selected_tasks = db.Column(db.Text, default='[]')
    enabled = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'task_id', name='unique_user_scheduled_task'),
    )

    def to_dict(self):
        user = User.query.get(self.user_id)
        return {
            'id': self.task_id,
            'userId': self.user_id,
            'username': user.username if user else None,
            'name': self.name,
            'runType': self.run_type,
            'runTime': self.run_time,
            'cronExpression': self.cron_expression,
            'selectedTokens': json.loads(self.selected_tokens) if self.selected_tokens else [],
            'selectedTasks': json.loads(self.selected_tasks) if self.selected_tasks else [],
            'enabled': self.enabled,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

    def from_dict(self, data):
        if data is None:
            data = {}
        if data.get('id') or data.get('task_id'):
            self.task_id = data.get('id') or data.get('task_id')
        if not self.task_id:
            self.task_id = f'task_{datetime.now().timestamp()}'
        if 'name' in data:
            self.name = data.get('name', 'New Task')
        if 'runType' in data:
            self.run_type = data.get('runType', 'daily')
        if 'run_type' in data:
            self.run_type = data.get('run_type', 'daily')
        if 'runTime' in data or 'run_time' in data:
            self.run_time = data.get('runTime') or data.get('run_time')
        if 'cronExpression' in data or 'cron_expression' in data:
            self.cron_expression = data.get('cronExpression') or data.get('cron_expression')
        if 'selectedTokens' in data:
            self.selected_tokens = json.dumps(data.get('selectedTokens', []))
        if 'selected_tokens' in data:
            self.selected_tokens = json.dumps(data.get('selected_tokens', []))
        if 'token_ids' in data:
            self.selected_tokens = json.dumps(data.get('token_ids', []))
        if 'selectedTasks' in data:
            self.selected_tasks = json.dumps(data.get('selectedTasks', []))
        if 'selected_tasks' in data:
            self.selected_tasks = json.dumps(data.get('selected_tasks', []))
        if 'settings' in data and isinstance(data.get('settings'), dict):
            settings = data.get('settings', {})
            if 'selectedTasks' in settings:
                self.selected_tasks = json.dumps(settings.get('selectedTasks', []))
        if 'enabled' in data:
            self.enabled = data.get('enabled', True)
        if 'is_active' in data:
            self.enabled = data.get('is_active', True)

    def __repr__(self):
        return f'<ScheduledTask {self.name}>'


class TaskExecutionLog(db.Model):
    __tablename__ = 'task_execution_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    task_id = db.Column(db.String(100), nullable=False, index=True)
    task_name = db.Column(db.String(100), nullable=True)
    token_id = db.Column(db.String(100), nullable=True, index=True)
    token_name = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(20), nullable=False)
    message = db.Column(db.Text, nullable=True)
    steps = db.Column(db.Text, nullable=True)
    logs = db.Column(db.Text, nullable=True)
    error = db.Column(db.Text, nullable=True)
    details = db.Column(db.Text, nullable=True)
    duration = db.Column(db.Integer, nullable=True)
    tokens_total = db.Column(db.Integer, default=0)
    tokens_success = db.Column(db.Integer, default=0)
    tokens_failed = db.Column(db.Integer, default=0)
    execution_batch_id = db.Column(db.String(100), nullable=True, index=True)
    started_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    executed_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'taskId': self.task_id,
            'taskName': self.task_name,
            'tokenId': self.token_id,
            'tokenName': self.token_name,
            'status': self.status,
            'message': self.message,
            'steps': json.loads(self.steps) if self.steps else None,
            'logs': json.loads(self.logs) if self.logs else None,
            'error': self.error,
            'details': json.loads(self.details) if self.details else None,
            'duration': self.duration,
            'tokensTotal': self.tokens_total,
            'tokensSuccess': self.tokens_success,
            'tokensFailed': self.tokens_failed,
            'executionBatchId': self.execution_batch_id,
            'startedAt': self.started_at.isoformat() + 'Z' if self.started_at else None,
            'completedAt': self.completed_at.isoformat() + 'Z' if self.completed_at else None,
            'executedAt': self.executed_at.isoformat() + 'Z' if self.executed_at else None
        }

    def __repr__(self):
        return f'<TaskExecutionLog {self.task_id} {self.status}>'
