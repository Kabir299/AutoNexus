/*
    AutoNexus shared demo-mechanic generator.
    Used by both the Dashboard mini-map and the full Mechanics page so
    nearby mechanic listings:
      - vary in count from place to place (not a fixed number every time)
      - vary in which businesses show up each time you search
      - are spread around the given point at random realistic distances
    instead of a single hardcoded list, while still using a stable id
    per business name so a favourited mechanic is recognized again if
    it's picked in a later search.
*/
(function(){

    const NAME_POOL = [
        "AutoCare Motors","Rapid Auto Service","Goyal Auto Works",
        "RoadFix Garage","Prime Car Care","City Auto Experts",
        "Sharma Motors","Highway Auto Hub","Precision Car Clinic",
        "Speedy Wheels Service","Metro Auto Point","Elite Motor Works",
        "Sunrise Auto Garage","Trustline Car Care","QuickFix Motors",
        "Capital Auto Service","Green Signal Garage","Chandigarh Car Clinic",
        "Punjab Auto Zone","Victory Motor Works"
    ];

    const SERVICE_POOL = [
        "Car Repair","Tyres","Battery","Oil / Service","Car Wash"
    ];

    function slug(name){
        return name.toLowerCase()
            .replace(/[^a-z0-9]+/g,"-")
            .replace(/(^-|-$)/g,"");
    }

    function shuffle(array){
        const copy = array.slice();
        for(let i=copy.length-1;i>0;i--){
            const j = Math.floor(Math.random()*(i+1));
            [copy[i],copy[j]] = [copy[j],copy[i]];
        }
        return copy;
    }

    function randomPhone(){
        let digits = "";
        for(let i=0;i<9;i++) digits += Math.floor(Math.random()*10);
        return `+91 9${digits}`;
    }

    function pickServices(){
        const count = 1 + Math.floor(Math.random()*3); // 1-3
        return shuffle(SERVICE_POOL).slice(0,count);
    }

    /*
        Generates a fresh, randomized set of nearby mechanics around
        (lat,lng). Count and exact set vary on every call.
    */
    function generateNearbyMechanics(lat,lng){
        const count = 4 + Math.floor(Math.random()*6); // 4-9
        const chosenNames = shuffle(NAME_POOL).slice(0,count);

        // Every mechanic must fall within 0-4km, except at most one which
        // is allowed to land in the 4-5km band. Pick that one (if any)
        // ahead of time so exactly 0 or 1 listing ever crosses 4km.
        const farIndex = Math.random() < 0.5 ? Math.floor(Math.random()*chosenNames.length) : -1;

        return chosenNames.map((name,i)=>{
            const angle = Math.random()*Math.PI*2;
            const distanceKm = i===farIndex
                ? 4 + Math.random()*1     // the one allowed outlier: 4km - 5km
                : 0.3 + Math.random()*3.7; // everyone else: 0.3km - 4km

            const latDelta = (distanceKm/111) * Math.cos(angle);
            const lngDelta =
                (distanceKm/(111*Math.cos(lat*Math.PI/180))) *
                Math.sin(angle);

            const mLat = lat + latDelta;
            const mLng = lng + lngDelta;

            return {
                id:`demo-${slug(name)}`,
                name,
                lat:mLat,
                lng:mLng,
                address:"Nearby service location",
                phone:randomPhone(),
                website:"",
                rating:Number((4 + Math.random()).toFixed(1)),
                services:pickServices(),
                favorite:false,
                open:Math.random() > 0.15,
                distance:distanceKm
            };
        });
    }

    window.AutoNexusMechanics = { generateNearbyMechanics };

})();
