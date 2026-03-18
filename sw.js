self.addEventListener('install', function(e) {
  self.skipWaiting();
});
self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});
self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  // Never intercept Supabase API requests — always network-only
  if (url.indexOf('supabase.co') !== -1) return;
  e.respondWith(fetch(e.request));
});
