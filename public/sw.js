const CACHE_NAME = 'xyzw-helper-v1';
const STATIC_CACHE = 'xyzw-static-v1';
const DYNAMIC_CACHE = 'xyzw-dynamic-v1';
const IMAGE_CACHE = 'xyzw-images-v1';

// 静态资源 - 核心应用文件
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/xiaoyugan.png',
  '/icons/xiaoyugan.png'
];

// 需要缓存的 API 响应
const API_ROUTES = [
  '/api/',
];

// 安装 Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker 安装中...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] 缓存静态资源');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((err) => {
        console.error('[SW] 静态资源缓存失败:', err);
      })
  );
  
  // 立即激活
  self.skipWaiting();
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker 激活中...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // 删除旧版本缓存
          if (cacheName !== STATIC_CACHE && 
              cacheName !== DYNAMIC_CACHE && 
              cacheName !== IMAGE_CACHE) {
            console.log('[SW] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // 立即控制所有客户端
  self.clients.claim();
});

// 获取请求策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 跳过非 GET 请求
  if (request.method !== 'GET') {
    return;
  }
  
  // 跳过 chrome-extension 请求
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  // 图片资源 - 缓存优先，网络回退
  if (request.destination === 'image') {
    event.respondWith(imageCacheStrategy(request));
    return;
  }
  
  // API 请求 - 网络优先，缓存回退
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }
  
  // 静态资源 - 缓存优先，网络回退
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }
  
  // 其他请求 - 网络优先
  event.respondWith(networkFirstStrategy(request));
});

// 缓存优先策略
async function cacheFirstStrategy(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  
  if (cached) {
    // 后台更新缓存
    fetch(request).then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
    }).catch(() => {});
    
    return cached;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[SW] 网络请求失败:', error);
    return new Response('离线中，无法加载资源', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// 网络优先策略
async function networkFirstStrategy(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] 网络失败，尝试缓存:', request.url);
    const cached = await cache.match(request);
    
    if (cached) {
      return cached;
    }
    
    // 返回离线页面
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    
    throw error;
  }
}

// 图片缓存策略
async function imageCacheStrategy(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // 返回默认图片
    return new Response('', { status: 404 });
  }
}

// 判断是否为静态资源
function isStaticAsset(url) {
  const staticExtensions = ['.js', '.css', '.json', '.woff', '.woff2', '.ttf'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

// 后台同步
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncPendingTasks());
  }
});

// 同步待处理任务
async function syncPendingTasks() {
  const db = await openDB('pending-tasks', 1);
  const tasks = await db.getAll('tasks');
  
  for (const task of tasks) {
    try {
      await fetch('/api/tasks/execute', {
        method: 'POST',
        body: JSON.stringify(task),
        headers: { 'Content-Type': 'application/json' }
      });
      await db.delete('tasks', task.id);
    } catch (error) {
      console.error('[SW] 同步任务失败:', error);
    }
  }
}

// 推送通知
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || '您有一条新消息',
    icon: '/icons/xiaoyugan.png',
    badge: '/icons/xiaoyugan.png',
    tag: data.tag || 'default',
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
    data: data.data || {}
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'XYZW助手', options)
  );
});

// 通知点击
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const notificationData = event.notification.data;
  let url = '/';
  
  if (notificationData?.url) {
    url = notificationData.url;
  } else if (event.notification.tag === 'task') {
    url = '/admin/task-scheduler';
  } else if (event.notification.tag === 'legion-war') {
    url = '/admin/legion-war';
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // 如果已有窗口打开，则聚焦
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      // 否则打开新窗口
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// 周期性后台同步（如果支持）
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-tasks') {
    event.waitUntil(checkScheduledTasks());
  }
});

// 检查定时任务
async function checkScheduledTasks() {
  // 向所有客户端发送消息，检查是否有待执行的任务
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage({
      type: 'CHECK_SCHEDULED_TASKS',
      timestamp: Date.now()
    });
  });
}

// IndexedDB 辅助函数
function openDB(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('tasks')) {
        db.createObjectStore('tasks', { keyPath: 'id' });
      }
    };
  });
}

// 消息处理（来自主线程）
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CACHE_URLS':
      caches.open(DYNAMIC_CACHE).then(cache => {
        cache.addAll(data.urls);
      });
      break;
      
    case 'CLEAR_CACHE':
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
      break;
      
    case 'GET_CACHE_STATUS':
      caches.keys().then(names => {
        event.source.postMessage({
          type: 'CACHE_STATUS',
          data: { caches: names }
        });
      });
      break;
  }
});

console.log('[SW] Service Worker 加载完成');
