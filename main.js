/* Initialize MapLibre + Firebase realtime updates */
maplibregl.accessToken = 'none';

/* Firebase */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

/* --- Firebase Config --- */
const firebaseConfig = {
  databaseURL: "https://soilbitchina-default-rtdb.firebaseio.com/"
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
    if (!coords || coords.X === undefined || coords.Y === undefined) {
      console.warn(`${nodeName} skipped: missing coordinates`);
      return;
    }
    coordsList.push([coords.X, coords.Y]);

    const packets = Object.values(nodeData.Packets || {});
    const latestPacket = packets.length > 0 ? packets[packets.length - 1] : null;

    if (markers[nodeName]) markers[nodeName].remove();

    // If no packets, marker is grey
    const markerColor = latestPacket ? "red" : "grey";

    const marker = new maplibregl.Marker({ color: markerColor })
      .setLngLat([coords.X, coords.Y])
      .addTo(map);

    const container = document.createElement("div");
    container.className = "popup-content";
    container.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

    const title = document.createElement("h3");
    title.textContent = nodeName;
    title.style.textAlign = "center";
    container.appendChild(title);

    if (!latestPacket) {
      // No data yet
      const noData = document.createElement("p");
      noData.textContent = "No data available yet.";
      noData.style.textAlign = "center";
      container.appendChild(noData);
    } else {
      // Existing code for parameters and bars
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

        barContainer.append(bar, barLines);

        const info = document.createElement("button");
        info.textContent = "ℹ️";
        info.className = "info-btn";

        const disabledFlag = latestPacket[`Disabled_${param}_done`];
        const shouldDisable = inRange || disabledFlag !== undefined;

        info.disabled = shouldDisable;
        info.style.opacity = shouldDisable ? "0.3" : "1.0";
        info.style.cursor = shouldDisable ? "not-allowed" : "pointer";

        // Click advisory handler
        info.onclick = () => {
          if (info.disabled) return;

          const globalAdvisory = document.getElementById("global-advisory");
          const popupEl = document.querySelector(".maplibregl-popup-content");

          if (
            globalAdvisory.dataset.activeNode === nodeName &&
            globalAdvisory.dataset.activeParam === param
          ) {
            globalAdvisory.style.display = "none";
            globalAdvisory.dataset.activeNode = "";
            globalAdvisory.dataset.activeParam = "";
            return;
          }

          const message = value < min ? messages[param].low : messages[param].high;
          globalAdvisory.innerHTML = `
            <p class="advisory-text">${message}</p>
            <button id="doneBtn" class="done-btn">Done</button>
            <p class="note-text">
              Note: For parameters like NPK, EC, and pH, changes may take time or days to appear.
              If an action is performed, please wait before checking results.
            </p>
          `;
          globalAdvisory.style.display = "block";
          globalAdvisory.dataset.activeNode = nodeName;
          globalAdvisory.dataset.activeParam = param;

          function updateAdvisoryPosition() {
            const popup = document.querySelector(".maplibregl-popup-content");
            if (popup && globalAdvisory.style.display === "block") {
              const rect = popup.getBoundingClientRect();
              globalAdvisory.style.top = `${rect.bottom + window.scrollY + 8}px`;
              globalAdvisory.style.left = `${
                rect.left + window.scrollX + rect.width / 2 - globalAdvisory.offsetWidth / 2
              }px`;
            }
          }
          updateAdvisoryPosition();
          map.on("move", updateAdvisoryPosition);
          map.on("zoom", updateAdvisoryPosition);
          const popupObserver = new MutationObserver(updateAdvisoryPosition);
          if (popupEl) popupObserver.observe(popupEl, { childList: true, subtree: true });

          document.getElementById("doneBtn").onclick = async () => {
            try {
              suppressUpdate = true;
              const timeClicked = Date.now();
              const disabledKey = `Disabled_${param}_done`;
              const packetKeys = Object.keys(nodeData.Packets || {});
              if (packetKeys.length === 0) return;
              const latestKey = packetKeys[packetKeys.length - 1];
              const disabledPath = `Users/${username}/Farm/Nodes/${nodeName}/Packets/${latestKey}/${disabledKey}`;
              await set(ref(db, disabledPath), timeClicked);
              info.disabled = true;
              info.style.opacity = "0.3";
              info.style.cursor = "not-allowed";
              globalAdvisory.style.display = "none";
              setTimeout(() => (suppressUpdate = false), 2000);
            } catch (err) {
              console.error("❌ Error disabling:", err);
              suppressUpdate = false;
            }
          };
        };

        row.append(label, barContainer, info);
        container.appendChild(row);
      });
    }

    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "toggle-btn";
    toggleBtn.textContent = "⬇️";
    toggleBtn.onclick = () => {
      const extras = container.querySelectorAll(".extra");
      const hidden = extras[0]?.classList.contains("hidden");
      extras.forEach((e) => e.classList.toggle("hidden", !hidden));
      toggleBtn.textContent = hidden ? "⬆️" : "⬇️";
    };
    container.append(toggleBtn);

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

      if (popup.isOpen()) popup.remove();
      else {
        Object.values(markers).forEach(m => {
          const p = m.getPopup();
          if (p && p.isOpen()) p.remove();
        });
        popup.addTo(map);
      }
    });

    popup.on("close", () => {
      document.getElementById("global-advisory").style.display = "none";
    });
  });

  // Zoom to first node
 // --- Zoom to the country with the most nodes ---
if (coordsList.length > 0) {
  const geocodePromises = coordsList.map(([lng, lat]) =>
    fetch(`https://api.maptiler.com/geocoding/${lng},${lat}.json?key=k0zBlTOs7WrHcJIfCohH`)
      .then(res => res.json())
      .catch(() => null)
  );

  Promise.all(geocodePromises).then(results => {
    const countryCount = {};
    const countryBboxes = {};

    results.forEach(json => {
      if (!json || !json.features) return;
      const countryFeature = json.features.find(f => f.place_type.includes("country"));
      if (!countryFeature) return;

      const country = countryFeature.properties.name;
      countryCount[country] = (countryCount[country] || 0) + 1;

      // Store bbox for the country if we haven't yet
      if (!countryBboxes[country] && countryFeature.bbox) {
        countryBboxes[country] = countryFeature.bbox;
      }
    });

    // Find country with most nodes
    const maxCountry = Object.entries(countryCount).reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0])[0];
    const bbox = countryBboxes[maxCountry];

    if (bbox) {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]]
        ],
        { padding: 50, duration: 1200 }
      );
    }
  });
}

}


