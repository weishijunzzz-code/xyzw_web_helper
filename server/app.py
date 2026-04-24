import os
import sys
import logging
import traceback
from pathlib import Path
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException

env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

jwt_secret = os.environ.get('JWT_SECRET_KEY')
print(f'[DEBUG] JWT_SECRET_KEY loaded: {"***" + jwt_secret[-4:] if jwt_secret and len(jwt_secret) > 4 else "NOT SET or TOO SHORT"}')
print(f'[DEBUG] JWT_SECRET_KEY length: {len(jwt_secret) if jwt_secret else 0}')

from flask import Flask, jsonify, request
from flask_cors import CORS
from extensions import db, jwt, configure_jwt
from config import config

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def create_app(config_name=None):
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')

    app = Flask(__name__)
    app.config.from_object(config[config_name])

    db.init_app(app)
    jwt.init_app(app)
    configure_jwt(app)

    CORS(app,
         origins=app.config.get('CORS_ORIGINS', '*'),
         supports_credentials=True,
         allow_headers=['Content-Type', 'Authorization'])

    from routes.auth import auth_bp
    from routes.admin import admin_bp
    from routes.token import token_bp
    from routes.task import task_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(token_bp)
    app.register_blueprint(task_bp)

    @app.route('/api/v1/health', methods=['GET'])
    def health_check():
        return {'status': 'ok', 'message': 'Server is running'}

    @app.errorhandler(400)
    def bad_request(error):
        logger.warning(f'Bad request: {error}')
        return jsonify({'success': False, 'message': str(error)}), 400

    @app.errorhandler(404)
    def not_found(error):
        logger.warning(f'Not found: {request.path}')
        return jsonify({'success': False, 'message': 'Resource not found'}), 404

    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f'Internal error: {error}\n{traceback.format_exc()}')
        return jsonify({'success': False, 'message': 'Internal server error'}), 500

    @app.errorhandler(Exception)
    def handle_exception(error):
        if isinstance(error, HTTPException):
            return error
        logger.error(f'Unhandled exception: {error}\n{traceback.format_exc()}')
        return jsonify({'success': False, 'message': f'Server error: {str(error)}'}), 500

    with app.app_context():
        db.create_all()
        init_admin_user(app)
        init_default_tasks(app)

    return app


def init_admin_user(app):
    from models import User
    from sqlalchemy.exc import IntegrityError

    admin_username = app.config.get('ADMIN_USERNAME', 'admin')
    admin_password = app.config.get('ADMIN_PASSWORD', 'admin123456')

    try:
        admin = User.query.filter_by(username=admin_username).first()

        if not admin:
            admin = User(
                username=admin_username,
                is_admin=True,
                is_active=True
            )
            admin.set_password(admin_password)
            db.session.add(admin)
            db.session.commit()
            print(f'Admin user created: {admin_username}')
        else:
            print(f'Admin user already exists: {admin_username}')
    except IntegrityError:
        db.session.rollback()
        print(f'Admin user already exists (race condition): {admin_username}')
    except Exception as e:
        db.session.rollback()
        print(f'Error creating admin user: {e}')


def init_default_tasks(app):
    from models import User, ScheduledTask
    from sqlalchemy.exc import IntegrityError
    import json

    try:
        admin = User.query.filter_by(is_admin=True).first()
        if not admin:
            print('No admin user found, skipping default task creation')
            return

        task_id = 'default_refresh_tokens'
        existing = ScheduledTask.query.filter_by(user_id=admin.id, task_id=task_id).first()

        if not existing:
            default_task = ScheduledTask(
                user_id=admin.id,
                task_id=task_id,
                name='每日刷新Token',
                run_type='daily',
                run_time='11:50',
                selected_tokens=json.dumps([]),
                selected_tasks=json.dumps(['refreshTokens']),
                enabled=True
            )
            db.session.add(default_task)
            db.session.commit()
            print('Default refresh tokens task created: 每天 11:50 执行')
        else:
            print('Default refresh tokens task already exists')
    except IntegrityError:
        db.session.rollback()
        print('Default task already exists (race condition)')
    except Exception as e:
        db.session.rollback()
        print(f'Error creating default task: {e}')


app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
