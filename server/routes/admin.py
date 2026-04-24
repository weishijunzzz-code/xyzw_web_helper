from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from functools import wraps
from extensions import db
from models import User, GameToken, ScheduledTask, TaskExecutionLog
import json

admin_bp = Blueprint('admin', __name__, url_prefix='/api/v1/admin')


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user or not user.is_admin:
            return jsonify({'success': False, 'message': '需要管理员权限'}), 403

        g.current_user = user
        g.current_user_id = user_id

        return fn(*args, **kwargs)
    return wrapper


@admin_bp.route('/users', methods=['GET'])
@jwt_required()
@admin_required
def get_users():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = User.query.order_by(User.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    users = pagination.items

    return jsonify({
        'success': True,
        'data': {
            'users': [user.to_dict() for user in users],
            'total': pagination.total,
            'pages': pagination.pages,
            'current_page': page
        }
    })


@admin_bp.route('/users/<int:user_id>', methods=['GET'])
@jwt_required()
@admin_required
def get_user(user_id):
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404

    token_count = GameToken.query.filter_by(user_id=user_id).count()
    user_dict = user.to_dict()
    user_dict['tokenCount'] = token_count

    return jsonify({
        'success': True,
        'data': user_dict
    })


@admin_bp.route('/users/<int:user_id>/authorize', methods=['POST'])
@jwt_required()
@admin_required
def authorize_user(user_id):
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404

    data = request.get_json()
    days = data.get('days', 30)

    user.authorized_until = datetime.utcnow() + timedelta(days=days)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'用户已授权 {days} 天',
        'data': user.to_dict()
    })


@admin_bp.route('/users/<int:user_id>/authorize-until', methods=['POST'])
@jwt_required()
@admin_required
def authorize_user_until(user_id):
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404

    data = request.get_json()
    expire_date_str = data.get('expireDate')

    if not expire_date_str:
        return jsonify({'success': False, 'message': '请提供到期日期'}), 400

    try:
        expire_date = datetime.fromisoformat(expire_date_str.replace('Z', '+00:00'))
        user.authorized_until = expire_date
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'用户已授权至 {expire_date_str}',
            'data': user.to_dict()
        })
    except ValueError:
        return jsonify({'success': False, 'message': '日期格式无效'}), 400


@admin_bp.route('/users/<int:user_id>/deauthorize', methods=['POST'])
@jwt_required()
@admin_required
def deauthorize_user(user_id):
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404

    user.authorized_until = None
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '用户授权已取消',
        'data': user.to_dict()
    })


@admin_bp.route('/users/<int:user_id>/toggle-active', methods=['POST'])
@jwt_required()
@admin_required
def toggle_user_active(user_id):
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404

    user.is_active = not user.is_active
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'用户{"启用" if user.is_active else "禁用"}成功',
        'data': user.to_dict()
    })


@admin_bp.route('/users/<int:user_id>/max-tokens', methods=['POST'])
@jwt_required()
@admin_required
def update_user_max_tokens(user_id):
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404

    data = request.get_json()
    max_tokens = data.get('maxTokens')

    if max_tokens is None or not isinstance(max_tokens, int) or max_tokens < 1:
        return jsonify({'success': False, 'message': '无效的Token数量限制'}), 400

    user.max_tokens = max_tokens
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'用户Token上限已更新为 {max_tokens}',
        'data': user.to_dict()
    })


@admin_bp.route('/users/<int:user_id>/toggle-schedule-tasks', methods=['POST'])
@jwt_required()
@admin_required
def toggle_user_schedule_tasks(user_id):
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404

    user.can_schedule_tasks = not user.can_schedule_tasks
    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'用户定时任务权限{"开启" if user.can_schedule_tasks else "关闭"}',
        'data': user.to_dict()
    })


@admin_bp.route('/users/<int:user_id>/delete', methods=['POST'])
@jwt_required()
@admin_required
def delete_user(user_id):
    user = User.query.get(user_id)

    if not user:
        return jsonify({'success': False, 'message': '用户不存在'}), 404

    if user.is_admin:
        return jsonify({'success': False, 'message': '不能删除管理员账户'}), 400

    db.session.delete(user)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '用户已删除'
    })


@admin_bp.route('/users/batch-authorize', methods=['POST'])
@jwt_required()
@admin_required
def batch_authorize_users():
    data = request.get_json()

    if not data or not isinstance(data.get('user_ids'), list):
        return jsonify({'success': False, 'message': '数据无效'}), 400

    user_ids = data['user_ids']
    days = data.get('days', 30)

    updated_count = 0
    for user_id in user_ids:
        user = User.query.get(user_id)
        if user and not user.is_admin:
            user.authorized_until = datetime.utcnow() + timedelta(days=days)
            updated_count += 1

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'已授权 {updated_count} 个用户 {days} 天'
    })


@admin_bp.route('/users/batch-authorize-until', methods=['POST'])
@jwt_required()
@admin_required
def batch_authorize_users_until():
    data = request.get_json()

    if not data or not isinstance(data.get('user_ids'), list):
        return jsonify({'success': False, 'message': '数据无效'}), 400

    user_ids = data['user_ids']
    expire_date_str = data.get('expireDate')

    if not expire_date_str:
        return jsonify({'success': False, 'message': '请提供到期日期'}), 400

    try:
        expire_date = datetime.fromisoformat(expire_date_str.replace('Z', '+00:00'))
    except ValueError:
        return jsonify({'success': False, 'message': '日期格式无效'}), 400

    updated_count = 0
    for user_id in user_ids:
        user = User.query.get(user_id)
        if user and not user.is_admin:
            user.authorized_until = expire_date
            updated_count += 1

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'已授权 {updated_count} 个用户至 {expire_date_str}'
    })


@admin_bp.route('/stats', methods=['GET'])
@jwt_required()
@admin_required
def get_stats():
    total_users = User.query.count()
    active_users = User.query.filter_by(is_active=True).count()
    authorized_users = User.query.filter(User.authorized_until > datetime.utcnow()).count()
    admin_users = User.query.filter_by(is_admin=True).count()

    total_tokens = GameToken.query.count()
    total_tasks = ScheduledTask.query.count()

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_executions = TaskExecutionLog.query.filter(TaskExecutionLog.started_at >= today).count()

    return jsonify({
        'success': True,
        'data': {
            'users': {
                'total': total_users,
                'active': active_users,
                'authorized': authorized_users,
                'admins': admin_users
            },
            'tokens': {
                'total': total_tokens
            },
            'tasks': {
                'total': total_tasks,
                'todayExecutions': today_executions
            }
        }
    })
