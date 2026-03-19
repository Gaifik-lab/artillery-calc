const CACHE_NAME = 'arty-calc-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Cache the generated JS bundle
  './tables/tables.js'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Opened cache');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch Event (Network First, fallback to Cache First)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // First try to fetch from network to get updates instantly
      return fetch(event.request)
        .then((netResponse) => {
           // Update cache
           return caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, netResponse.clone());
             return netResponse;
           });
        })
        .catch(() => {
           // On offline, return cached
           if (response) return response;
           if (event.request.url.includes('index.html')) {
             return caches.match('./index.html');
           }
        });
    })
  );
});
