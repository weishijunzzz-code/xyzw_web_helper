from datetime import datetime
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from functools import wraps
from extensions import db
from models import User, GameToken, UserConfig, TokenGroup
import json
import requests
import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

token_bp = Blueprint('token', __name__, url_prefix='/api/v1')


def check_user_status(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
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
                'success': False,
                'message': '未授权或授权已过期',
                'authorized': False
            }), 403

        g.current_user = user
        g.current_user_id = user_id

        return fn(*args, **kwargs)
    return wrapper


# Token相关API
@token_bp.route('/tokens', methods=['GET'])
@jwt_required()
@check_user_status
def get_tokens():
    user_id = g.current_user_id
    tokens = GameToken.query.filter_by(user_id=user_id).all()

    return jsonify({
        'success': True,
        'authorized': True,
        'data': {
            'tokens': [token.to_dict() for token in tokens]
        }
    })


@token_bp.route('/tokens', methods=['POST'])
@jwt_required()
@check_user_status
def add_token():
    user_id = g.current_user_id
    user = g.current_user
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': '数据无效'}), 400

    token = GameToken(user_id=user_id)
    token.from_dict(data)

    existing = GameToken.query.filter_by(user_id=user_id, token_id=token.token_id).first()
    if existing:
        existing.from_dict(data)
        existing.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'Token已更新',
            'data': existing.to_dict()
        })

    if not user.is_admin:
        current_count = GameToken.query.filter_by(user_id=user_id).count()
        max_tokens = user.max_tokens or 3
        if current_count >= max_tokens:
            return jsonify({
                'success': False,
                'message': f'已达到Token数量上限（{max_tokens}个），请联系管理员提升配额'
            }), 400

    db.session.add(token)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Token添加成功',
        'data': token.to_dict()
    })


@token_bp.route('/tokens/batch', methods=['POST'])
@jwt_required()
@check_user_status
def batch_add_tokens():
    user_id = g.current_user_id
    user = g.current_user
    data = request.get_json()

    if not data or not isinstance(data.get('tokens'), list):
        return jsonify({'success': False, 'message': '数据无效'}), 400

    tokens_data = data['tokens']
    added_count = 0
    updated_count = 0

    if not user.is_admin:
        current_count = GameToken.query.filter_by(user_id=user_id).count()
        max_tokens = user.max_tokens or 3
        available_slots = max_tokens - current_count

        new_tokens_count = 0
        for token_data in tokens_data:
            token = GameToken(user_id=user_id)
            token.from_dict(token_data)
            existing = GameToken.query.filter_by(user_id=user_id, token_id=token.token_id).first()
            if not existing:
                new_tokens_count += 1

        if new_tokens_count > available_slots:
            return jsonify({
                'success': False,
                'message': f'批量添加将超过Token数量上限（当前{current_count}个，上限{max_tokens}个，可添加{available_slots}个，尝试添加{new_tokens_count}个）'
            }), 400

    for token_data in tokens_data:
        token = GameToken(user_id=user_id)
        token.from_dict(token_data)

        existing = GameToken.query.filter_by(user_id=user_id, token_id=token.token_id).first()
        if existing:
            existing.from_dict(token_data)
            existing.updated_at = datetime.utcnow()
            updated_count += 1
        else:
            db.session.add(token)
            added_count += 1

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'添加 {added_count} 个，更新 {updated_count} 个'
    })


@token_bp.route('/tokens/update-order', methods=['POST'])
@jwt_required()
@check_user_status
def update_tokens_order():
    user_id = g.current_user_id
    data = request.get_json()

    if not data or not isinstance(data.get('orders'), list):
        return jsonify({'success': False, 'message': '数据无效'}), 400

    orders = data['orders']
    updated_count = 0

    for item in orders:
        token_id = item.get('id')
        sort_order = item.get('sortOrder') or item.get('sort_order')

        if token_id is None or sort_order is None:
            continue

        token = GameToken.query.filter_by(user_id=user_id, token_id=token_id).first()
        if token:
            token.sort_order = sort_order
            token.updated_at = datetime.utcnow()
            updated_count += 1

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'排序更新成功：{updated_count} 个Token'
    })


@token_bp.route('/tokens/<token_id>', methods=['POST', 'PUT'])
@jwt_required()
@check_user_status
def update_token(token_id):
    user_id = g.current_user_id
    token = GameToken.query.filter_by(user_id=user_id, token_id=token_id).first()

    if not token:
        return jsonify({'success': False, 'message': 'Token不存在'}), 404

    data = request.get_json()
    if data:
        token.from_dict(data)
        token.updated_at = datetime.utcnow()
        db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Token更新成功',
        'data': token.to_dict()
    })


@token_bp.route('/tokens/<token_id>', methods=['DELETE'])
@jwt_required()
@check_user_status
def delete_token(token_id):
    user_id = g.current_user_id
    token = GameToken.query.filter_by(user_id=user_id, token_id=token_id).first()

    if not token:
        return jsonify({'success': False, 'message': 'Token不存在'}), 404

    db.session.delete(token)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': 'Token删除成功'
    })


@token_bp.route('/tokens/<token_id>/delete', methods=['POST'])
@jwt_required()
@check_user_status
def delete_token_post(token_id):
    return delete_token(token_id)


@token_bp.route('/tokens/clear', methods=['POST'])
@jwt_required()
def clear_tokens():
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

    GameToken.query.filter_by(user_id=user_id).delete()
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '所有Token已清除'
    })


# Token分组API
@token_bp.route('/tokens/groups', methods=['GET'])
@jwt_required()
@check_user_status
def get_groups():
    user_id = g.current_user_id
    groups = TokenGroup.query.filter_by(user_id=user_id).all()

    return jsonify({
        'success': True,
        'authorized': True,
        'data': {
            'groups': [group.to_dict() for group in groups]
        }
    })


@token_bp.route('/tokens/groups', methods=['POST'])
@jwt_required()
@check_user_status
def add_group():
    user_id = g.current_user_id
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': '数据无效'}), 400

    group = TokenGroup(user_id=user_id)
    group.from_dict(data)

    existing = TokenGroup.query.filter_by(user_id=user_id, group_id=group.group_id).first()
    if existing:
        existing.from_dict(data)
        existing.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify({
            'success': True,
            'message': '分组已更新',
            'data': existing.to_dict()
        })

    db.session.add(group)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '分组添加成功',
        'data': group.to_dict()
    })


@token_bp.route('/tokens/groups/<group_id>/delete', methods=['POST'])
@jwt_required()
@check_user_status
def delete_group(group_id):
    user_id = g.current_user_id
    group = TokenGroup.query.filter_by(user_id=user_id, group_id=group_id).first()

    if not group:
        return jsonify({'success': False, 'message': '分组不存在'}), 404

    db.session.delete(group)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '分组删除成功'
    })


@token_bp.route('/tokens/groups/<group_id>', methods=['POST', 'PUT'])
@jwt_required()
@check_user_status
def update_group(group_id):
    user_id = g.current_user_id
    group = TokenGroup.query.filter_by(user_id=user_id, group_id=group_id).first()

    if not group:
        return jsonify({'success': False, 'message': '分组不存在'}), 404

    data = request.get_json()
    if data:
        group.from_dict(data)
        group.updated_at = datetime.utcnow()
        db.session.commit()

    return jsonify({
        'success': True,
        'message': '分组更新成功',
        'data': group.to_dict()
    })


@token_bp.route('/tokens/groups/sync', methods=['POST'])
@jwt_required()
@check_user_status
def sync_groups():
    user_id = g.current_user_id
    data = request.get_json()

    if not data or not isinstance(data.get('groups'), list):
        return jsonify({'success': False, 'message': '数据无效'}), 400

    groups_data = data['groups']

    existing_groups = TokenGroup.query.filter_by(user_id=user_id).all()
    existing_ids = {g.group_id for g in existing_groups}

    updated_count = 0
    created_count = 0

    for group_data in groups_data:
        group_id = group_data.get('id')
        if not group_id:
            continue

        existing = TokenGroup.query.filter_by(user_id=user_id, group_id=group_id).first()
        if existing:
            existing.from_dict(group_data)
            existing.updated_at = datetime.utcnow()
            updated_count += 1
        else:
            group = TokenGroup(user_id=user_id)
            group.from_dict(group_data)
            db.session.add(group)
            created_count += 1

    new_ids = {g.get('id') for g in groups_data if g.get('id')}
    for group in existing_groups:
        if group.group_id not in new_ids:
            db.session.delete(group)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'分组同步成功：新建 {created_count} 个，更新 {updated_count} 个'
    })


# Token导出/导入API
@token_bp.route('/tokens/export', methods=['GET'])
@jwt_required()
@check_user_status
def export_tokens():
    user_id = g.current_user_id
    tokens = GameToken.query.filter_by(user_id=user_id).order_by(GameToken.sort_order).all()
    groups = TokenGroup.query.filter_by(user_id=user_id).order_by(TokenGroup.sort_order).all()

    return jsonify({
        'success': True,
        'authorized': True,
        'data': {
            'version': '2.2',
            'tokens': [token.to_dict() for token in tokens],
            'groups': [group.to_dict() for group in groups],
            'exportedAt': datetime.utcnow().isoformat()
        }
    })


@token_bp.route('/tokens/import', methods=['POST'])
@jwt_required()
@check_user_status
def import_tokens():
    user_id = g.current_user_id
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': '数据无效'}), 400

    imported_tokens = 0
    imported_groups = 0

    if data.get('tokens'):
        for token_data in data['tokens']:
            token = GameToken(user_id=user_id)
            token.from_dict(token_data)

            existing = GameToken.query.filter_by(user_id=user_id, token_id=token.token_id).first()
            if existing:
                existing.from_dict(token_data)
                existing.updated_at = datetime.utcnow()
            else:
                db.session.add(token)
                imported_tokens += 1

    groups_data = data.get('groups') or data.get('tokenGroups')
    if groups_data:
        for group_data in groups_data:
            group = TokenGroup(user_id=user_id)
            group.from_dict(group_data)

            existing = TokenGroup.query.filter_by(user_id=user_id, group_id=group.group_id).first()
            if existing:
                existing.from_dict(group_data)
                existing.updated_at = datetime.utcnow()
            else:
                db.session.add(group)
                imported_groups += 1

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'导入完成：{imported_tokens} 个Token，{imported_groups} 个分组'
    })


# 用户配置API
@token_bp.route('/tokens/config', methods=['GET'])
@jwt_required()
def get_config():
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

    configs = UserConfig.query.filter_by(user_id=user_id).all()
    config_dict = {}
    for c in configs:
        try:
            config_dict[c.config_key] = json.loads(c.config_value)
        except (json.JSONDecodeError, TypeError):
            config_dict[c.config_key] = c.config_value

    return jsonify({
        'success': True,
        'data': config_dict
    })


@token_bp.route('/tokens/config', methods=['POST'])
@jwt_required()
def save_config():
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

    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': '数据无效'}), 400

    for key, value in data.items():
        config = UserConfig.query.filter_by(user_id=user_id, config_key=key).first()

        if isinstance(value, str):
            try:
                json.loads(value)
                config_value = value
            except (json.JSONDecodeError, TypeError):
                config_value = json.dumps(value)
        else:
            config_value = json.dumps(value)

        if config:
            config.config_value = config_value
            config.updated_at = datetime.utcnow()
        else:
            config = UserConfig(
                user_id=user_id,
                config_key=key,
                config_value=config_value
            )
            db.session.add(config)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': '配置保存成功'
    })
