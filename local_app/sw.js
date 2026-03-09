/**
 * sw.js - 帳票管理アプリ (pado) Service Worker
 * アセットキャッシュによる完全オフライン対応
 */

const CACHE_NAME = 'pado-v1.0.0-1773064948';

const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/pado.calc.js',
    '/version.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-512.png',
    '/icons/apple-touch-icon.png',
    '/icons/favicon-32.png',
    '/icons/favicon-16.png',
    '/usecases_showcase.html'
];

const SPLASH_IMAGES = [
    '/icons/splash/splash-640x1136.png',
    '/icons/splash/splash-750x1334.png',
    '/icons/splash/splash-1125x2436.png',
    '/icons/splash/splash-828x1792.png',
    '/icons/splash/splash-1170x2532.png',
    '/icons/splash/splash-1179x2556.png',
    '/icons/splash/splash-1290x2796.png',
    '/icons/splash/splash-1320x2868.png',
    '/icons/splash/splash-1536x2048.png',
    '/icons/splash/splash-1668x2388.png',
    '/icons/splash/splash-2048x2732.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await cache.addAll(PRECACHE_ASSETS);
            for (const url of SPLASH_IMAGES) {
                try { await cache.add(url); } catch (e) { console.warn('splash cache skip:', url); }
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cached) => {
                if (cached) {
                    return cached;
                }
                return fetch(event.request).then((response) => {
                    if (!response || response.status !== 200 || response.type === 'opaque') {
                        return response;
                    }
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                });
            })
            .catch(() => {
                if (event.request.destination === 'document') {
                    return caches.match('/index.html');
                }
            })
    );
});
