/* Initialize MapLibre + Firebase realtime updates */
maplibregl.accessToken = 'none';

/* Firebase */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* --- Firebase Config --- */
const firebaseConfig = {
  databaseURL: "https://yurmam-40325-default-rtdb.firebaseio.com/"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* --- Parameters and Ranges --- */
const params = [
  "Temperature", "Moisture", "pH", "Salinity",
  "EC", "Nitrogen", "Phosphorus", "Potassium"
];

const ranges = {
  "pH": [6.00, 6.50],
  "Moisture": [30.00, 50.00],
  "Temperature": [18.00, 24.00],
  "Salinity": [0.50, 2.00],
  "EC": [0.50, 2.00],
  "Nitrogen": [80.00, 120.00],
  "Phosphorus": [20.00, 40.00],
  "Potassium": [80.00, 120.00]
};

const messages = {
  "pH": {
    low: "Soil pH is too low — acidic soil reduces nutrient availability and stunts growth.",
    high: "Soil pH is too high — alkaline soil locks nutrients and weakens plants."
  },
  "Moisture": {
    low: "Soil is too dry — roots can’t absorb enough water or nutrients.",
    high: "Soil is waterlogged — risk of root rot and poor plant health."
  },
  "Temperature": {
    low: "Soil is too cold — growth slows and flowering is delayed.",
    high: "Soil is too hot — plants are stressed and yield may drop."
  },
  "Salinity": {
    low: "Soil salinity is too low — may cause nutrient imbalance.",
    high: "Soil salinity is too high — roots are damaged and leaves may burn."
  },
  "Nitrogen": {
    low: "Nitrogen is too low — leaves turn yellow, growth slows.",
    high: "Nitrogen is too high — excess leaves form, flowering is delayed."
  },
  "Phosphorus": {
    low: "Phosphorus is too low — weak roots and poor flowering.",
    high: "Phosphorus is too high — micronutrient uptake is blocked, growth suffers."
  },
  "Potassium": {
    low: "Potassium is too low — plants are weak, bean quality drops.",
    high: "Potassium is too high — calcium and magnesium uptake is disrupted."
  },
  "EC": {
    low: "EC is too low — may cause nutrient imbalance.",
    high: "EC is too high — roots are damaged and leaves may burn."
  },
};

/* --- Username from URL --- */
const username = new URLSearchParams(window.location.search).get("user");
if (!username) {
  alert("⚠️ Please provide a username in the URL (e.g. ?user=jlcerna)");
  throw new Error("Username missing");
}

const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: [
          `https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}.jpg?key=k0zBlTOs7WrHcJIfCohH`
        ],
        tileSize: 256,
        attribution:
          '<a href="https://www.maptiler.com/" target="_blank">© MapTiler</a> © OpenStreetMap contributors'
      }
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite',
        minzoom: 0,
        maxzoom: 22
      }
    ]
  },
  center: [0, 0],
  zoom: 1,
  bearing: 0,
  pitch: 0
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

let markers = {};
let suppressUpdate = false;

/* --- Firebase Realtime Updates --- */
map.on("load", () => {
  const userRef = ref(db, `Users/${username}/Farm/Nodes`);
  onValue(userRef, (snapshot) => {
    if (suppressUpdate) return;
    const data = snapshot.val();
    if (data) updateMap(data);
  });
});

/* --- Update Map --- */
function updateMap(data) {
  const coordsList = [];
  let activePopupNode = null;

  Object.entries(data).forEach(([nodeName, nodeData]) => {
    const coords = nodeData.Coordinates;
    if (!coords) return;
    coordsList.push([coords.X, coords.Y]);

    const packets = Object.values(nodeData.Packets || {});
    if (packets.length === 0) return;
    const latestPacket = packets[packets.length - 1];

    if (markers[nodeName]) markers[nodeName].remove();

    const marker = new maplibregl.Marker({ color: "red" })
      .setLngLat([coords.X, coords.Y])
      .addTo(map);

    const container = document.createElement("div");
    container.className = "popup-content";
    container.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

    const title = document.createElement("h3");
    title.textContent = nodeName;
    title.style.textAlign = "center";
    container.appendChild(title);

    const advisoryContainer = document.createElement("div");
    advisoryContainer.className = "advisory-container";

    params.forEach((param, i) => {
      const row = document.createElement("div");
      row.className = `param-row ${i >= 4 ? "extra hidden" : ""}`;

      const label = document.createElement("span");
      label.textContent = param;
      label.className = "param-label";

      const value = parseFloat(latestPacket[param.toLowerCase()]) || 0;
      const [min, max] = ranges[param] || [0, 100];
      let percent = 0;

      if (param === "pH") percent = ((value - 3) / (9 - 3)) * 100;
      else if (param === "Moisture") percent = value;
      else if (param === "Temperature") percent = ((value - (-30)) / (70 - (-30))) * 100;
      else percent =
        (Math.log10(Math.max(value, 0.01)) - Math.log10(0.01)) /
        (Math.log10(20) - Math.log10(0.01)) * 100;

      const barContainer = document.createElement("div");
      barContainer.className = "bar-container";
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.width = Math.min(Math.max(percent, 0), 100) + "%";
      const inRange = value >= min && value <= max;
      bar.style.background = inRange ? "darkgreen" : "red";

      const barLines = document.createElement("div");
      barLines.className = "bar-lines";
      for (let j = 1; j < 10; j++) barLines.appendChild(document.createElement("div"));

      row.append(label, barContainer, document.createElement("button"));
      container.appendChild(row);
    });

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: [15, -15],
      anchor: "left",
    }).setDOMContent(container);

    marker.setPopup(popup);
    markers[nodeName] = marker;

    marker.getElement().addEventListener("click", (e) => {
      e.stopPropagation();

      if (activePopupNode === nodeName) {
        popup.remove();
        activePopupNode = null;
      } else {
        Object.values(markers).forEach(m => {
          const p = m.getPopup();
          if (p && p.isOpen()) p.remove();
        });
        popup.addTo(map);
        activePopupNode = nodeName;
      }
    });

    popup.on("close", () => {
      if (activePopupNode === nodeName) activePopupNode = null;
    });

    markers[nodeName] = marker;
  });

  /* ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐
     ⭐ ADDED FOR COUNTRY ZOOM — NOTHING ELSE CHANGED ⭐
     ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐ */

  if (coordsList.length > 0) {
    const [lng, lat] = coordsList[0]; // first node

    fetch(
      `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=k0zBlTOs7WrHcJIfCohH`
    )
      .then(res => res.json())
      .then(json => {
        if (!json.features || json.features.length === 0) return;

        const countryFeature = json.features.find(f => f.place_type.includes("country"));
        if (!countryFeature) return;

        const bbox = countryFeature.bbox;
        if (bbox) {
          map.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]]
            ],
            { padding: 50, duration: 1200 }
          );
        }
      })
      .catch(err => console.error("Reverse geocoding error:", err));
  }

  /* ⭐ END OF NEW CODE ⭐ */
}
