module.exports = {
  apps: [
    {
      name: 'xyzw-backend',
      cwd: './server',
      script: 'app.py',
      interpreter: 'python',
      env: {
        FLASK_ENV: 'development',
        FLASK_DEBUG: '0'
      },
      watch: false,
      restart_delay: 3000,
      max_restarts: 5,
      min_uptime: '10s',
      log_file: './logs/backend.log',
      out_file: './logs/backend-out.log',
      err_file: './logs/backend-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'xyzw-frontend',
      cwd: '.',
      script: 'node_modules/.bin/vite',
      args: '--port 5173',
      env: {
        NODE_ENV: 'development'
      },
      watch: false,
      restart_delay: 3000,
      max_restarts: 5,
      log_file: './logs/frontend.log',
      out_file: './logs/frontend-out.log',
      err_file: './logs/frontend-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'xyzw-task-worker',
      cwd: './task-worker',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'development'
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 5,
      min_uptime: '10s',
      log_file: './logs/task-worker.log',
      out_file: './logs/task-worker-out.log',
      err_file: './logs/task-worker-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
