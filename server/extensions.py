from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager

db = SQLAlchemy()
jwt = JWTManager()


def configure_jwt(app):
    """配置JWT扩展"""

    @jwt.user_identity_loader
    def user_identity_lookup(user):
        return str(user)

    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        return {'success': False, 'message': 'Token已过期', 'error': 'token_expired'}, 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        return {'success': False, 'message': '无效的Token', 'error': 'invalid_token'}, 422

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        return {'success': False, 'message': '缺少认证Token', 'error': 'missing_token'}, 401
