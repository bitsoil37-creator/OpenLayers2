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

/* --- Map setup --- */
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
  center: [125.2647, 6.9248],
  zoom: 18,
  bearing: 270, // facing west
  pitch: 0 // top-down
});

/* ✅ Only one compass control */
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

let markers = {};
let suppressUpdate = false; // keep suppression for Done-click behavior

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
      else percent = (Math.log10(Math.max(value, 0.01)) - Math.log10(0.01)) /
                     (Math.log10(20) - Math.log10(0.01)) * 100;

      const barContainer = document.createElement("div");
      barContainer.className = "bar-container";
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.width = Math.min(Math.max(percent, 0), 100) + "%";
      const inRange = (value >= min && value <= max);
      bar.style.background = inRange ? "darkgreen" : "red";

      const barLines = document.createElement("div");
      barLines.className = "bar-lines";
      for (let j = 1; j < 10; j++) barLines.appendChild(document.createElement("div"));

      const barValue = document.createElement("span");
      barValue.className = "bar-value";
      barValue.textContent = value.toFixed(2);

      barContainer.append(bar, barLines, barValue);

      const info = document.createElement("button");
      info.textContent = "ℹ️";
      info.className = "info-btn";

      const disabledFlag = latestPacket[`Disabled_${param}_done`];
      const shouldDisable = inRange || disabledFlag !== undefined;

      info.disabled = shouldDisable;
      info.style.opacity = shouldDisable ? "0.3" : "1.0";
      info.style.cursor = shouldDisable ? "not-allowed" : "pointer";

      info.onclick = () => {
        if (info.disabled) return;
        if (advisoryContainer.innerHTML !== "") {
          advisoryContainer.innerHTML = "";
        } else {
          const message = value < min ? messages[param].low : messages[param].high;
          const msg = document.createElement("p");
          msg.textContent = message;
          msg.className = "advisory-text";
          msg.style.color = "black";
          advisoryContainer.appendChild(msg);

          const doneBtn = document.createElement("button");
          doneBtn.textContent = "Done";
          doneBtn.className = "done-btn";
          doneBtn.style.background = "gray";
          doneBtn.style.color = "black";
          doneBtn.style.display = "block";
          doneBtn.style.margin = "10px auto";
          advisoryContainer.appendChild(doneBtn);

          const note = document.createElement("p");
          note.textContent = "Note: For parameters like NPK, EC, and pH, changes may take time or days to appear. If an action is performed, please wait before checking results.";
          note.className = "note-text";
          note.style.color = "black";
          advisoryContainer.appendChild(note);

          doneBtn.onclick = async () => {
            try {
              suppressUpdate = true;
              const timeClicked = Date.now();
              const disabledKey = `Disabled_${param}_done`;
              const packetKeys = Object.keys(nodeData.Packets || {});
              if (packetKeys.length === 0) return;
              const latestKey = packetKeys[packetKeys.length - 1];
              const disabledPath = `Users/${username}/Farm/Nodes/${nodeName}/Packets/${latestKey}/${disabledKey}`;

              await set(ref(db, disabledPath), timeClicked);
              console.log(`✅ Disabled ${param} for ${nodeName}`);

              info.disabled = true;
              info.style.opacity = "0.3";
              info.style.cursor = "not-allowed";
              advisoryContainer.innerHTML = "";

              setTimeout(() => {
                suppressUpdate = false;
              }, 2000);
            } catch (err) {
              console.error("❌ Error disabling:", err);
              suppressUpdate = false;
            }
          };
        }
      };

      row.append(label, barContainer, info);
      container.appendChild(row);
    });

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "toggle-btn";
    toggleBtn.textContent = "⬇️";
    toggleBtn.onclick = () => {
      const extras = container.querySelectorAll(".extra");
      const hidden = extras[0].classList.contains("hidden");
      extras.forEach(e => e.classList.toggle("hidden", !hidden));
      toggleBtn.textContent = hidden ? "⬆️" : "⬇️";
    };
    container.append(toggleBtn, advisoryContainer);

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: [15, -15],
      anchor: "left"
    }).setDOMContent(container);

    marker.setPopup(popup);
    markers[nodeName] = marker;
  });

  // Adjust zoom and bounds
  if (coordsList.length > 0) {
    let minX = Math.min(...coordsList.map(c => c[0]));
    let maxX = Math.max(...coordsList.map(c => c[0]));
    let minY = Math.min(...coordsList.map(c => c[1]));
    let maxY = Math.max(...coordsList.map(c => c[1]));

    map.resize();

    const w = map.getContainer().clientWidth || window.innerWidth;
    const h = map.getContainer().clientHeight || window.innerHeight;
    const viewRatio = w / h;

    let lngSpan = Math.max(0.00001, maxX - minX);
    let latSpan = Math.max(0.00001, maxY - minY);

    const boundsRatio = lngSpan / latSpan;

    if (boundsRatio < viewRatio) {
      const targetLngSpan = latSpan * viewRatio;
      const add = (targetLngSpan - lngSpan) / 2;
      minX -= add;
      maxX += add;
    } else if (boundsRatio > viewRatio) {
      const targetLatSpan = lngSpan / viewRatio;
      const add = (targetLatSpan - latSpan) / 2;
      minY -= add;
      maxY += add;
    }

    const adjustedBounds = new maplibregl.LngLatBounds([minX, minY], [maxX, maxY]);
    const padding = { top: 40, bottom: 40, left: Math.round(w * 0.12), right: Math.round(w * 0.12) };

    map.fitBounds(adjustedBounds, {
      padding,
      animate: true,
      maxZoom: 16,
      bearing: 270,
      pitch: 0
    });
  }
}



