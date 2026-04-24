from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity
)
from extensions import db
from models import User

auth_bp = Blueprint('auth', __name__, url_prefix='/api/v1/auth')


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()

    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'success': False, 'message': '用户名和密码不能为空'}), 400

    username = data['username'].strip()
    password = data['password']

    if len(username) < 3 or len(username) > 20:
        return jsonify({'success': False, 'message': '用户名长度应在3-20个字符之间'}), 400

    if len(password) < 6:
        return jsonify({'success': False, 'message': '密码长度不能少于6位'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'success': False, 'message': '用户名已存在'}), 400

    user = User(username=username)
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '注册成功，请等待管理员授权'
    }), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'success': False, 'message': '用户名和密码不能为空'}), 400

    username = data['username'].strip()
    password = data['password']

    user = User.query.filter_by(username=username).first()

    if not user or not user.check_password(password):
        return jsonify({'success': False, 'message': '用户名或密码错误'}), 401

    user.last_login = datetime.utcnow()
    db.session.commit()

    import os
    jwt_secret = os.environ.get('JWT_SECRET_KEY', 'default')
    print(f'[DEBUG] Login - JWT_SECRET_KEY used: {"***" + jwt_secret[-4:] if len(jwt_secret) > 4 else jwt_secret}')

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))

    print(f'[DEBUG] Login - access_token created (first 20 chars): {access_token[:20]}...')

    return jsonify({
        'success': True,
        'message': '登录成功',
        'data': {
            'accessToken': access_token,
            'refreshToken': refresh_token,
            'user': user.to_dict()
        }
    })


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user or not user.is_active:
        return jsonify({'success': False, 'message': '用户不存在或已被禁用'}), 401

    if not user.is_admin and not user.is_authorized():
        return jsonify({
            'success': False,
            'message': '授权已过期，请重新授权',
            'forbidden': True,
            'authorized': False
        }), 403

    access_token = create_access_token(identity=str(user.id))

    return jsonify({
        'success': True,
        'data': {
            'accessToken': access_token
        }
    })


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404

    if not user.is_active:
        return jsonify({
            'success': False,
            'message': '账户已被禁用',
            'forbidden': True,
            'authorized': False
        }), 403

    if not user.is_authorized():
        return jsonify({
            'success': True,
            'data': user.to_dict(),
            'authorized': False
        })

    return jsonify({
        'success': True,
        'data': user.to_dict()
    })


@auth_bp.route('/status', methods=['GET'])
@jwt_required()
def check_authorization():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在', 'authorized': False}), 404

    if not user.is_active:
        return jsonify({
            'success': False,
            'message': '账户已被禁用',
            'forbidden': True,
            'authorized': False
        }), 403

    return jsonify({
        'success': True,
        'authorized': user.is_authorized(),
        'data': user.to_dict()
    })


@auth_bp.route('/logout', methods=['POST'])
@jwt_required()
def logout():
    return jsonify({
        'success': True,
        'message': '退出成功'
    })


@auth_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404

    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': '请求数据无效'}), 400

    current_password = data.get('currentPassword', '')
    new_password = data.get('newPassword', '')

    if not current_password or not new_password:
        return jsonify({'success': False, 'message': '当前密码和新密码不能为空'}), 400

    if len(new_password) < 6:
        return jsonify({'success': False, 'message': '新密码长度不能少于6位'}), 400

    if not user.check_password(current_password):
        return jsonify({'success': False, 'message': '当前密码错误'}), 400

    if user.check_password(new_password):
        return jsonify({'success': False, 'message': '新密码不能与当前密码相同'}), 400

    user.set_password(new_password)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '密码修改成功'
    })
