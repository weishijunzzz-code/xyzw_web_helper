from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from functools import wraps
from extensions import db
from models import User, ScheduledTask, TaskExecutionLog, GameToken
import json
import uuid
import logging
import os

logger = logging.getLogger(__name__)

task_bp = Blueprint('task', __name__, url_prefix='/api/v1')


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


# 定时任务API
@task_bp.route('/scheduled-tasks', methods=['GET'])
@jwt_required()
@check_user_status
def get_scheduled_tasks():
    user_id = g.current_user_id
    user = g.current_user

    # 管理员可以查看所有用户的任务
    if user.is_admin:
        user_id_param = request.args.get('userId')
        if user_id_param:
            user_id = int(user_id_param)

    tasks = ScheduledTask.query.filter_by(user_id=user_id).all()

    return jsonify({
        'success': True,
        'data': {
            'tasks': [task.to_dict() for task in tasks]
        }
    })


@task_bp.route('/scheduled-tasks', methods=['POST'])
@jwt_required()
@check_user_status
def create_scheduled_task():
    user_id = g.current_user_id
    user = g.current_user

    if not user.can_use_scheduled_tasks():
        return jsonify({
            'success': False,
            'message': '没有权限创建定时任务'
        }), 403

    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': '数据无效'}), 400

    task = ScheduledTask(user_id=user_id)
    task.from_dict(data)

    db.session.add(task)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '定时任务创建成功',
        'data': task.to_dict()
    })


@task_bp.route('/scheduled-tasks/<task_id>', methods=['POST', 'PUT'])
@jwt_required()
@check_user_status
def update_scheduled_task(task_id):
    user_id = g.current_user_id
    user = g.current_user

    task = ScheduledTask.query.filter_by(user_id=user_id, task_id=task_id).first()

    if not task:
        return jsonify({'success': False, 'message': '任务不存在'}), 404

    data = request.get_json()

    if data:
        task.from_dict(data)
        task.updated_at = datetime.utcnow()
        db.session.commit()

    return jsonify({
        'success': True,
        'message': '定时任务更新成功',
        'data': task.to_dict()
    })


@task_bp.route('/scheduled-tasks/<task_id>/delete', methods=['POST'])
@jwt_required()
@check_user_status
def delete_scheduled_task(task_id):
    user_id = g.current_user_id

    task = ScheduledTask.query.filter_by(user_id=user_id, task_id=task_id).first()

    if not task:
        return jsonify({'success': False, 'message': '任务不存在'}), 404

    db.session.delete(task)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '定时任务已删除'
    })


@task_bp.route('/scheduled-tasks/<task_id>/execute', methods=['POST'])
@jwt_required()
@check_user_status
def execute_scheduled_task(task_id):
    user_id = g.current_user_id

    task = ScheduledTask.query.filter_by(user_id=user_id, task_id=task_id).first()

    if not task:
        return jsonify({'success': False, 'message': '任务不存在'}), 404

    # 创建执行批次ID
    execution_batch_id = str(uuid.uuid4())

    # 获取选中的tokens
    selected_tokens = json.loads(task.selected_tokens) if task.selected_tokens else []

    if not selected_tokens:
        return jsonify({'success': False, 'message': '任务没有配置Token'}), 400

    # 创建执行记录
    execution_logs = []
    for token_id in selected_tokens:
        token = GameToken.query.filter_by(user_id=user_id, token_id=token_id).first()
        if token:
            log = TaskExecutionLog(
                user_id=user_id,
                task_id=task_id,
                task_name=task.name,
                token_id=token_id,
                token_name=token.name,
                status='pending',
                execution_batch_id=execution_batch_id,
                started_at=datetime.utcnow()
            )
            db.session.add(log)
            execution_logs.append(log)

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'任务已提交执行，共 {len(execution_logs)} 个Token',
        'data': {
            'executionBatchId': execution_batch_id,
            'tokenCount': len(execution_logs)
        }
    })


@task_bp.route('/scheduled-tasks/<task_id>/execute-token', methods=['POST'])
@jwt_required()
@check_user_status
def execute_scheduled_task_for_token(task_id):
    user_id = g.current_user_id

    task = ScheduledTask.query.filter_by(user_id=user_id, task_id=task_id).first()

    if not task:
        return jsonify({'success': False, 'message': '任务不存在'}), 404

    data = request.get_json()
    token_id = data.get('tokenId')

    if not token_id:
        return jsonify({'success': False, 'message': '请提供Token ID'}), 400

    token = GameToken.query.filter_by(user_id=user_id, token_id=token_id).first()

    if not token:
        return jsonify({'success': False, 'message': 'Token不存在'}), 404

    # 创建执行批次ID
    execution_batch_id = str(uuid.uuid4())

    # 创建执行记录
    log = TaskExecutionLog(
        user_id=user_id,
        task_id=task_id,
        task_name=task.name,
        token_id=token_id,
        token_name=token.name,
        status='pending',
        execution_batch_id=execution_batch_id,
        started_at=datetime.utcnow()
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '任务已提交执行',
        'data': {
            'executionBatchId': execution_batch_id,
            'tokenId': token_id
        }
    })


# 执行日志API
@task_bp.route('/execution-logs', methods=['GET'])
@jwt_required()
@check_user_status
def get_execution_logs():
    user_id = g.current_user_id
    user = g.current_user

    # 查询参数
    task_id = request.args.get('taskId')
    token_id = request.args.get('tokenId')
    execution_batch_id = request.args.get('executionBatchId')
    date = request.args.get('date')
    limit = request.args.get('limit', 100, type=int)

    query = TaskExecutionLog.query.filter_by(user_id=user_id)

    if task_id:
        query = query.filter_by(task_id=task_id)
    if token_id:
        query = query.filter_by(token_id=token_id)
    if execution_batch_id:
        query = query.filter_by(execution_batch_id=execution_batch_id)

    if date:
        try:
            date_obj = datetime.fromisoformat(date.replace('Z', '+00:00'))
            start_of_day = date_obj.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = start_of_day + timedelta(days=1)
            query = query.filter(TaskExecutionLog.started_at >= start_of_day)
            query = query.filter(TaskExecutionLog.started_at < end_of_day)
        except ValueError:
            pass

    logs = query.order_by(TaskExecutionLog.started_at.desc()).limit(limit).all()

    return jsonify({
        'success': True,
        'data': {
            'logs': [log.to_dict() for log in logs]
        }
    })


@task_bp.route('/execution-logs', methods=['POST'])
@jwt_required()
@check_user_status
def create_execution_log():
    user_id = g.current_user_id
    data = request.get_json()

    if not data:
        return jsonify({'success': False, 'message': '数据无效'}), 400

    log = TaskExecutionLog(
        user_id=user_id,
        task_id=data.get('taskId'),
        task_name=data.get('taskName'),
        token_id=data.get('tokenId'),
        token_name=data.get('tokenName'),
        status=data.get('status', 'completed'),
        message=data.get('message'),
        steps=json.dumps(data.get('steps')) if data.get('steps') else None,
        logs=json.dumps(data.get('logs')) if data.get('logs') else None,
        error=data.get('error'),
        details=json.dumps(data.get('details')) if data.get('details') else None,
        duration=data.get('duration'),
        tokens_total=data.get('tokensTotal', 0),
        tokens_success=data.get('tokensSuccess', 0),
        tokens_failed=data.get('tokensFailed', 0),
        execution_batch_id=data.get('executionBatchId'),
        started_at=datetime.utcnow() if not data.get('startedAt') else datetime.fromisoformat(data.get('startedAt').replace('Z', '+00:00')),
        completed_at=datetime.utcnow() if data.get('status') in ['completed', 'failed'] else None
    )

    db.session.add(log)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '执行日志已创建',
        'data': log.to_dict()
    })


@task_bp.route('/execution-logs/cleanup', methods=['POST'])
@jwt_required()
@check_user_status
def cleanup_logs():
    user_id = g.current_user_id

    # 清理30天前的日志
    cutoff_date = datetime.utcnow() - timedelta(days=30)

    deleted_count = TaskExecutionLog.query.filter(
        TaskExecutionLog.user_id == user_id,
        TaskExecutionLog.started_at < cutoff_date
    ).delete()

    db.session.commit()

    return jsonify({
        'success': True,
        'message': f'已清理 {deleted_count} 条历史日志'
    })


@task_bp.route('/execution-logs/<int:log_id>', methods=['DELETE'])
@jwt_required()
@check_user_status
def delete_execution_log(log_id):
    user_id = g.current_user_id

    log = TaskExecutionLog.query.filter_by(id=log_id, user_id=user_id).first()

    if not log:
        return jsonify({'success': False, 'message': '日志不存在'}), 404

    db.session.delete(log)
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '日志已删除'
    })


# 任务模板API
@task_bp.route('/task-templates', methods=['GET'])
@jwt_required()
@check_user_status
def get_task_templates():
    # 返回系统预设的任务模板
    templates = [
        {
            'id': 'daily_signin',
            'name': '每日签到',
            'description': '自动完成每日签到任务',
            'defaultTasks': ['signin']
        },
        {
            'id': 'daily_tasks',
            'name': '日常任务',
            'description': '自动完成所有日常任务',
            'defaultTasks': ['signin', 'dailyTasks', 'claimRewards']
        },
        {
            'id': 'tower_challenge',
            'name': '咸将塔挑战',
            'description': '自动挑战咸将塔',
            'defaultTasks': ['towerChallenge']
        },
        {
            'id': 'arena_challenge',
            'name': '竞技场挑战',
            'description': '自动完成竞技场挑战',
            'defaultTasks': ['arenaChallenge']
        },
        {
            'id': 'club_signin',
            'name': '俱乐部签到',
            'description': '自动完成俱乐部签到',
            'defaultTasks': ['clubSignin']
        },
        {
            'id': 'refresh_tokens',
            'name': '刷新Token',
            'description': '自动刷新所有Token',
            'defaultTasks': ['refreshTokens']
        }
    ]

    return jsonify({
        'success': True,
        'data': {
            'templates': templates
        }
    })


# Worker状态API
@task_bp.route('/worker/status', methods=['GET'])
def get_worker_status():
    """获取任务服务状态（内部调用）"""
    internal_key = request.headers.get('X-Internal-Api-Key')
    if internal_key != os.environ.get('INTERNAL_API_KEY', 'xyzw-internal-api-key-2024'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    return jsonify({
        'success': True,
        'data': {
            'available': True,
            'timestamp': datetime.utcnow().isoformat()
        }
    })
