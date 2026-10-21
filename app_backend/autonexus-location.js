/* AutoNexus shared location layer
   Loaded before each page-specific script (same pattern as autonexus-sync.js).

   PROBLEM THIS FIXES:
   Every page (Dashboard, Mechanics Map, Emergency SOS...) used to call
   navigator.geolocation.getCurrentPosition() on its own as soon as it
   loaded. Because this is a multi-page app, moving from page to page
   reloads the JS context, so each page fired a brand new location
   request - which is why the browser kept asking for permission again
   and again.

   FIX:
   Cache the last known position (with a timestamp) in localStorage so
   it survives navigation AND full page refreshes/new tabs/browser
   restarts, not just the current tab session. Any page that just wants
   "roughly where the user is" reuses that cached value instead of
   asking the OS/browser for location again. Only a real user action
   (tapping "Use my location" / "Locate me" / "Detect location") forces
   a fresh GPS read. The cache is kept for a full day, since an
   approximate location for finding nearby mechanics doesn't need to be
   re-confirmed every few minutes.
*/
(function(){
    const CACHE_KEY = "autonexus_last_location";
    const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

    function readCache(){
        try{
            // Also check sessionStorage for any value cached before this
            // update, so an in-progress session doesn't lose its cache.
            const raw =
                localStorage.getItem(CACHE_KEY) ||
                sessionStorage.getItem(CACHE_KEY);
            return raw ? JSON.parse(raw) : null;
        }catch{
            return null;
        }
    }

    function writeCache(position){
        const payload = JSON.stringify({
            lat:position.coords.latitude,
            lng:position.coords.longitude,
            accuracy:position.coords.accuracy,
            ts:Date.now()
        });
        try{
            localStorage.setItem(CACHE_KEY, payload);
        }catch{ /* storage unavailable - ignore */ }
    }

    /*
        getUserLocation(options) -> Promise<{lat,lng,accuracy,cached}>

        options:
          force     - if true, skip the cache and always ask the browser
                      for a fresh position (use this for explicit
                      "Use my location" buttons).
          maxAgeMs  - how old a cached position is allowed to be before
                      it's considered stale (default 5 minutes).
          geoOptions- passed straight through to getCurrentPosition.
    */
    function getUserLocation(options={}){
        const {
            force=false,
            maxAgeMs=DEFAULT_MAX_AGE_MS,
            geoOptions={enableHighAccuracy:true,timeout:12000,maximumAge:60000}
        } = options;

        if(!force){
            const cached = readCache();
            if(cached && (Date.now()-cached.ts) < maxAgeMs){
                return Promise.resolve({
                    lat:cached.lat,
                    lng:cached.lng,
                    accuracy:cached.accuracy,
                    cached:true
                });
            }
        }

        return new Promise((resolve,reject)=>{
            if(!navigator.geolocation){
                reject(new Error("Geolocation is not supported by this browser."));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                position=>{
                    writeCache(position);
                    resolve({
                        lat:position.coords.latitude,
                        lng:position.coords.longitude,
                        accuracy:position.coords.accuracy,
                        cached:false
                    });
                },
                error=>reject(error),
                geoOptions
            );
        });
    }

    window.AutoNexusLocation = { getUserLocation };
})();
