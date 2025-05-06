import * as THREE from "three";
import { GLTFLoader } from "three/GLTFLoader";
import { RGBELoader } from "three/RGBELoader";

let scene, camera, renderer, model, videoTexture, videoPlane;
const container = document.getElementById("container");
const loadingScreen = document.getElementById("loadingScreen");
const loadingText = document.createElement("div");
loadingText.innerText = "Zoom in on the Walkman and hit the 'Play' button...";
loadingText.style.textAlign = "center";
loadingScreen.appendChild(loadingText);
const loadingPercentage = document.createElement("div");
loadingPercentage.id = "loadingPercentage";
loadingScreen.appendChild(loadingPercentage);

let video;
const nowPlayingContainer = document.getElementById("nowPlayingContainer");
const progressBar = document.getElementById("progressBar");

const MIN_DISPLAY_TIME = 0;
const loadingStartTime = Date.now();

const manager = new THREE.LoadingManager();
manager.onProgress = function (url, itemsLoaded, itemsTotal) {
  const progress = Math.round((itemsLoaded / itemsTotal) * 100);
  loadingPercentage.innerText = `${progress}%`;
};
manager.onLoad = function () {
  const elapsed = Date.now() - loadingStartTime;
  const remaining = Math.max(MIN_DISPLAY_TIME - elapsed, 0);
  setTimeout(() => {
    loadingScreen.style.display = "none";
    container.style.display = "block";
  }, remaining);
};

init();
window.init = init;
window.animate = animate;

function animate() {
  requestAnimationFrame(animate);

  if (model) {
    const fastSpeed = ((Math.PI * 2 * 0.25) / 50) * 16.67;
    const wobbleAmplitude = 0.05;
    const wobbleSpeed = 0.005;

    // Manage spin trigger timing
    if (typeof animate.isSpinning === "undefined") {
      animate.isSpinning = false;
      animate.lastSwitch = Date.now();
    }

    const now = Date.now();
    const elapsed = now - animate.lastSwitch;

    if (!animate.isSpinning && elapsed > 3000) {
      animate.isSpinning = true;
      animate.spinStart = now;
    }

    if (animate.isSpinning) {
      model.rotation.z += fastSpeed;
      if (now - animate.spinStart > 450) {
        animate.isSpinning = false;
        animate.lastSwitch = now;
      }
    } else {
      // Wobble in place when not spinning
      const frontRotation =
        Math.PI / 0.5 + Math.sin(now * wobbleSpeed) * wobbleAmplitude;
      model.rotation.z = frontRotation;
    }
  }

  updateNowPlayingProgress();
  renderer.render(scene, camera);
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    10000
  );
  camera.position.set(5.4, 20, 15);
  camera.lookAt(5.9, 4, 3);

  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setClearColor(0x000000);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMappingExposure = 1.5;
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 3);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2);
  hemisphereLight.position.set(0, 200, 0);
  scene.add(hemisphereLight);

  const directionalLight1 = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight1.position.set(1, 1, 1).normalize();
  scene.add(directionalLight1);

  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight2.position.set(-1, -1, -1).normalize();
  scene.add(directionalLight2);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  new RGBELoader()
    .setDataType(THREE.HalfFloatType)
    .load("assets/little_paris_under_tower_1k.hdr", function (texture) {
      const envMap = pmremGenerator.fromEquirectangular(texture).texture;
      scene.environment = envMap;
      texture.dispose();
      pmremGenerator.dispose();
    });

  const loader = new GLTFLoader(manager);
  loader.load("assets/model/model.gltf", function (gltf) {
    model = gltf.scene;
    model.position.set(0, 0, 0);
    model.scale.set(200, 200, 200);
    scene.add(model);

    model.traverse((child) => {
      if (child.isMesh) {
        child.material.envMapIntensity = 2;
      }
    });

    if (videoTexture) createVideoPlaneOverlay();
  });

  window.addEventListener("resize", onWindowResize, false);
  createVideoTexture();
  animate();

  // Allow audio playback after user interaction
  document.body.addEventListener(
    "click",
    () => {
      video.muted = false;
      video.volume = 1;
      video.play().catch((err) => console.error("Manual play failed:", err));
    },
    { once: true }
  );
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function createVideoTexture() {
  video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("controls", "");
  // video.setAttribute("muted", "");
  // video.muted = true;
  video.crossOrigin = "anonymous";
  video.loop = true;

  const hlsUrl =
    "https://customer-2qqx87orhla11tfu.cloudflarestream.com/aed3641ac7d831d9b845bede45881698/manifest/video.m3u8"; //customer-2qqx87orhla11tfu.cloudflarestream.com/aed3641ac7d831d9b845bede45881698/manifest/video.m3u8";

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = hlsUrl;
    video.load();
    setupVideoTexture();
  } else if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, function () {
      hls.currentLevel = hls.levels.length - 1; // Force highest quality level
      setupVideoTexture();
      createVideoPlaneOverlay();
    });
  } else {
    console.error("HLS not supported in this browser");
  }

  function setupVideoTexture() {
    videoTexture = new THREE.VideoTexture(video);
    videoTexture.format = THREE.RGBFormat;
    videoTexture.encoding = THREE.sRGBEncoding;
    videoTexture.repeat.set(1, 1);
    videoTexture.offset.set(0, 0);
    videoTexture.flipY = false;
  }
}

function createVideoPlaneOverlay() {
  if (!videoTexture || !model) return;

  const glass2 = model.getObjectByName("Glass2");
  if (!glass2) return;

  const screenWorldPosition = new THREE.Vector3();
  const screenWorldQuaternion = new THREE.Quaternion();
  glass2.getWorldPosition(screenWorldPosition);
  glass2.getWorldQuaternion(screenWorldQuaternion);

  const parent = glass2.parent;
  const localPosition = new THREE.Vector3();
  parent.worldToLocal(localPosition.copy(screenWorldPosition));

  const videoGeometry = new THREE.PlaneGeometry(16, 9);
  const videoMaterial = new THREE.MeshBasicMaterial({
    map: videoTexture,
    side: THREE.DoubleSide,
  });

  videoPlane = new THREE.Mesh(videoGeometry, videoMaterial);
  videoPlane.visible = true;
  video.addEventListener("canplaythrough", () => {
    if (document.visibilityState === "visible") {
      video.play().catch((err) => console.error("Autoplay blocked:", err));
    }
  });
  videoPlane.position
    .copy(localPosition)
    .add(new THREE.Vector3(-0.5, 0.06, 0.05));
  videoPlane.quaternion.copy(screenWorldQuaternion);
  videoPlane.scale.set(-0.29, 0.29, 0.29);
  videoPlane.rotateY(Math.PI);
  videoPlane.rotation.x += 0.6;

  parent.add(videoPlane);
}

function updateNowPlayingProgress() {
  if (!video || video.paused || video.ended || !video.duration) return;
  const percent = (video.currentTime / video.duration) * 100;
  progressBar.style.width = `${percent}%`;
}
