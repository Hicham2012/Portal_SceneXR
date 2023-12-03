import * as dat from 'lil-gui'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import firefliesVertexShader from './shaders/fireflies/vertex.glsl'
import firefliesFragmentShader from './shaders/fireflies/fragment.glsl'
import portalVertexShader from './shaders/portal/vertex.glsl'
import portalFragmentShader from './shaders/portal/fragment.glsl'
import gsap from 'gsap'
import { ARButton } from "https://unpkg.com/three@0.133.0/examples/jsm/webxr/ARButton.js";
mobileDebug();

let container;
let camera, scene, renderer;
let reticle;
let controller;
let model;
let portalLightMesh;
let portalLightMaterial;
let raycaster;
let savedIntersectedObject = null;
let line;
let stopHitTest = false;
let audioIsInitialized = false;
let audioIsPlaying = false;

const positionOfAudioAndSphere = { x: 0, y: 0, z: -0.5 };

init();
animate();


function mobileDebug() {
    const containerER = document.getElementById('console-ui')
    eruda.init({
        container: containerER
    })
}

function init() {
    container = document.createElement("div");
    document.body.appendChild(container);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        20
    );

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    var light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    scene.add(light);

    // Add a line to the scene that will represent the raycast
    createRaycastLine();

    // Add raycaster manager
    raycaster = new THREE.Raycaster();

    controller = renderer.xr.getController(0);
    controller.addEventListener("select", onSelect);
    scene.add(controller);



    addReticleToScene();
    addModelToScene(); // add only 1 model to the scene and we will just update it's position

    const button = ARButton.createButton(renderer, {
        requiredFeatures: ["hit-test"], // notice a new required feature
        optionalFeatures: ["dom-overlay", "dom-overlay-for-handheld-ar"],
        domOverlay: {
            root: document.body,
        }

    });
    document.body.appendChild(button);
    renderer.domElement.style.display = "none";
    button.addEventListener('click', () => {
        const text = document.getElementById('text')
        text.style.display = 'none'
    })

    /**
     * Sizes
     */
    const sizes = {
        width: window.innerWidth,
        height: window.innerHeight
    }

    window.addEventListener("resize", () => {
        // Update sizes
        sizes.width = window.innerWidth
        sizes.height = window.innerHeight

        // Update fireflies
        firefliesMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2)

        // Update camera
        camera.aspect = sizes.width / sizes.height
        camera.updateProjectionMatrix()

        // Update renderer
        renderer.setSize(sizes.width, sizes.height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }, false);
}

// add only 1 model to the scene and we will just update it's position
async function addModelToScene() {

    /**
     * Loaders
     */
    // Texture loader
    const textureLoader = new THREE.TextureLoader()


    // Draco loader
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('draco/')

    // GLTF loader
    const gltfLoader = new GLTFLoader()
    gltfLoader.setDRACOLoader(dracoLoader)

    /**
     * Object
     */

    // Texture
    const bakedTexture = textureLoader.load('/baked.jpg')
    bakedTexture.flipY = false
    bakedTexture.colorSpace = THREE.SRGBColorSpace;

    // Material
    const bakedMaterial = new THREE.MeshBasicMaterial({ map: bakedTexture })
    const poleLightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffe3 })
    portalLightMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uWidth: { value: 0.8 },
            uTime: { value: 0 },
            uColorStart: { value: new THREE.Color(0xcec5c5) },
            uColorEnd: { value: new THREE.Color(0xfcfffa) }
        },
        vertexShader: portalVertexShader,
        fragmentShader: portalFragmentShader
    })


    gltfLoader.load(
        'portal.glb',
        (gltf) => {
            model = gltf.scene
            const bakedMesh = gltf.scene.children.find(child => child.name === 'baked')
            portalLightMesh = gltf.scene.children.find(child => child.name === 'portalLight')
            const poleLightAMesh = gltf.scene.children.find(child => child.name === 'poleLightA')
            const poleLightBMesh = gltf.scene.children.find(child => child.name === 'poleLightB')

            // Apply material
            bakedMesh.material = bakedMaterial
            poleLightAMesh.material = poleLightMaterial
            poleLightBMesh.material = poleLightMaterial
            portalLightMesh.material = portalLightMaterial

            model.scale.multiplyScalar(1.55)
            model.visible = false
            model.position.set(positionOfAudioAndSphere.x, positionOfAudioAndSphere.y, positionOfAudioAndSphere.z);

            scene.add(model)
        })
}

/**
 * Fireflies
 */
// Geometry
const firefliesGeometry = new THREE.BufferGeometry()
const firefliesCount = 30
const positionArray = new Float32Array(firefliesCount * 3)
const scaleArray = new Float32Array(firefliesCount)

for (let i = 0; i < firefliesCount; i++) {
    positionArray[i * 3 + 0] = (Math.random() - 0.5) * 4
    positionArray[i * 3 + 1] = Math.random() * 1.5
    positionArray[i * 3 + 2] = (Math.random() - 0.5) * 4
    scaleArray[i] = Math.random()
}

firefliesGeometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3))
firefliesGeometry.setAttribute('aScale', new THREE.BufferAttribute(scaleArray, 1))

// Material
const firefliesMaterial = new THREE.ShaderMaterial({
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uSize: { value: 100 },
        uTime: { value: new THREE.Color('red') }
    },
    vertexShader: firefliesVertexShader,
    fragmentShader: firefliesFragmentShader,
})


// Points
const fireflies = new THREE.Points(firefliesGeometry, firefliesMaterial)
fireflies.visible = false
scene.add(fireflies)

function addReticleToScene() {
    const geometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial();

    reticle = new THREE.Mesh(geometry, material);

    // we will calculate the position and rotation of this reticle every frame manually
    // in the render() function so matrixAutoUpdate is set to false
    reticle.matrixAutoUpdate = false;
    reticle.visible = false; // we start with the reticle not visible
    scene.add(reticle);
}

// After tapping on the white recticle function
// we will make model and fireflies visible while
// hidding the recticle
function onSelect() {
    if (reticle.visible && model) {
        model.visible = true; // make sure we set the model to visible
        // just update its position, not necessarily to create a new one
        model.position.setFromMatrixPosition(reticle.matrix);
        fireflies.visible = true
            // fireflies.position.setFromMatrixPosition(reticle.matrix)
        scene.remove(reticle)
        stopHitTest = true;

        // setup audio and the sphere
        // only will run one time since isAudioInitialized will be true next time
        if (!audioIsInitialized) {
            setupAudioScene();
        }

        // model.position.set(reticle.position)
        // model.quaternion.setFromRotationMatrix(reticle.matrix);
        window.addEventListener('touchstart', () => {
            if (savedIntersectedObject) {
                // Choose random color
                const color_array = [0xFFB84C, 0xF266AB, 0xA459D1, 0x2CD3E1]
                const random_color = Math.floor(Math.random() * color_array.length)
                const tl = gsap.timeline()
                tl
                    .to(portalLightMaterial.uniforms.uWidth, {
                        value: -1.0,
                        duration: 1.5,
                        ease: 'power1.out',
                    })
                    .call(() => portalLightMaterial.uniforms.uColorEnd.value.lerp(new THREE.Color(color_array[random_color]), 0.8))
                    .call(() => portalLightMaterial.uniforms.uColorStart.value.lerpColors(new THREE.Color(0xcec5c5), new THREE.Color(0xfcfffa), 1))
                    .call(() => playSoundEffect())
                    .to(portalLightMaterial.uniforms.uWidth, {
                        value: 0.8,
                        duration: 1.5,
                        ease: 'power1',
                    })

            }
        })
    }
}

function animate() {
    renderer.setAnimationLoop(render);
}

// read more about hit testing here:
// https://github.com/immersive-web/hit-test/blob/master/hit-testing-explainer.md
// https://web.dev/ar-hit-test/

// hit testing provides the position and orientation of the intersection point, but nothing about the surfaces themselves.

let hitTestSource = null;
let localSpace = null;
let hitTestSourceInitialized = false;

// This function gets called just once to initialize a hitTestSource
// The purpose of this function is to get a) a hit test source and b) a reference space
async function initializeHitTestSource() {
    const session = renderer.xr.getSession(); // XRSession

    // Reference spaces express relationships between an origin and the world.

    // For hit testing, we use the "viewer" reference space,
    // which is based on the device's pose at the time of the hit test.
    const viewerSpace = await session.requestReferenceSpace("viewer");
    hitTestSource = await session.requestHitTestSource({
        space: viewerSpace,
    });

    // We're going to use the reference space of "local" for drawing things.
    // which gives us stability in terms of the environment.
    // read more here: https://developer.mozilla.org/en-US/docs/Web/API/XRReferenceSpace
    localSpace = await session.requestReferenceSpace("local");

    // set this to true so we don't request another hit source for the rest of the session
    hitTestSourceInitialized = true;

    // In case we close the AR session by hitting the button "End AR"
    session.addEventListener("end", () => {
        hitTestSourceInitialized = false;
        hitTestSource = null;
        location.reload()
    });
}

// the callback from 'setAnimationLoop' can also return a timestamp
// and an XRFrame, which provides access to the information needed in
// order to render a single frame of animation for an XRSession describing
// a VR or AR sccene.

const clock = new THREE.Clock()

function render(timestamp, frame) {
    if (frame) {
        const elapsedTime = clock.getElapsedTime()
            // will run each frame
        if (resonanceAudioScene !== undefined) {
            // set position and orienation of listener based on camera/cube
            resonanceAudioScene.setListenerFromMatrix(camera.matrixWorld);
        }

        if (resonanceSoundEffectScene !== undefined) {
            // set position and orienation of listener based on camera/cube
            resonanceSoundEffectScene.setListenerFromMatrix(camera.matrixWorld);
        }

        // 1. create a hit test source once and keep it for all the frames
        // this gets called only once
        if (!hitTestSourceInitialized) {
            initializeHitTestSource();
        }

        // 2. get hit test results
        if (hitTestSourceInitialized) {
            // we get the hit test results for a particular frame
            const hitTestResults = frame.getHitTestResults(hitTestSource);

            // XRHitTestResults The hit test may find multiple surfaces. The first one in the array is the one closest to the camera.
            if (hitTestResults.length > 0 && !stopHitTest) {
                const hit = hitTestResults[0];
                // Get a pose from the hit test result. The pose represents the pose of a point on a surface.
                const pose = hit.getPose(localSpace);

                reticle.visible = true;
                // Transform/move the reticle image to the hit test position
                reticle.matrix.fromArray(pose.transform.matrix);
            } else {
                reticle.visible = false;
            }

        }

        const cameraDirection = getCameraDirectionNormalized();
        raycaster.set(getCameraPosition(), cameraDirection);

        // Update the origin and end positions of the line
        updateRaycasterHelperLine(); // optional function to visualize the line

        // See where the ray intersects with the two mesh cubes in the scene
        const intersectsArray = raycaster.intersectObject(portalLightMesh);

        // Go through an array of intersected objects
        if (intersectsArray.length > 0) {
            for (const intersectObject of intersectsArray) {
                // Case 3: if the currently selected object is not the same one as the last selected object
                // then we have to change the color of the previously select object back to green
                if (intersectObject.object !== savedIntersectedObject && savedIntersectedObject !== null) {

                    savedIntersectedObject = null;
                }

                // Case 1: if the object is a mesh (i.e. a cube) we want to change the color of the cube to white
                if (intersectObject.object instanceof THREE.Mesh) {
                    // portalLightMaterial.uniforms.uColorStart.value.set('blue'); // change the color of the cube to white

                    savedIntersectedObject = intersectObject.object; // save a reference of the last intersected object
                }
            }
        } else {
            // Case 2: if we have a last saved object, but our ray isn't currently selecting anything
            // then we have to change the color back to the original color
            if (savedIntersectedObject !== null) {
                // portalLightMaterial.uniforms.uColorStart.value.setHex(0x00ff00); // set the color of the cube back to the original green
                savedIntersectedObject = null; // we're not pointing at any objects to this variable goes back to null
            }
        }

        // Animate fireflies
        firefliesMaterial.uniforms.uTime.value = elapsedTime

        // Animate portal
        portalLightMaterial.uniforms.uTime.value = elapsedTime

        renderer.render(scene, camera);
    }
}

/**
 * Spatial Audio
 */

let audioElement;
let audioContext;
let resonanceAudioScene;
let soundEffectElement;
let soundEffectContext;
let resonanceSoundEffectScene;



function setupAudioScene() {
    // createSphere();
    createAudioScene(); // first we create an audio scene
    createPositionalAudio(); // then we create the audio track
    createSoundScene();
    soundEffect(); // prepare soundEffect
    audioIsInitialized = true;
    playAudio();
}

// Create an AudioContext
// Can only do so AFTER user does a gesture (like a click) on the page
function createAudioScene() {
    // have to set AudioContext for different browsers
    const AudioContext = window.AudioContext || window.webkitAudioContext || false;
    window.AudioContext = AudioContext;

    audioContext = new AudioContext();

    // Create a Resonance Audio scene and pass it he AudioContext.
    resonanceAudioScene = new ResonanceAudio(audioContext);

    // Connect the scene’s binaural output to stereo out.
    resonanceAudioScene.output.connect(audioContext.destination);
}

function createPositionalAudio() {
    // Create an AudioElement.
    audioElement = document.createElement("audio");

    // Load an audio file into the AudioElement
    // do not load a music file as ogg, won't play in Firefox
    const url = 'https://cdn.glitch.global/456b0838-c3cc-4d61-813a-09dd332d684e/Final%20Fantasy%20Main%20Theme%20(Orchestral)%20(mp3cut.net)%20(2).mp3?v=1692705668685';
    audioElement.src = url;
    audioElement.crossOrigin = 'anonymous';
    audioElement.loop = true;

    // Generate a MediaElementSource from the AudioElement.
    const audioElementSource = audioContext.createMediaElementSource(
        audioElement
    );

    // Add the MediaElementSource to the scene as an audio input source.
    const source = resonanceAudioScene.createSource();
    audioElementSource.connect(source.input);

    // Set the source position relative to the room center (source default position).
    // More API references here: https://resonance-audio.github.io/resonance-audio/reference/web/Source
    source.setPosition(positionOfAudioAndSphere.x, positionOfAudioAndSphere.y, positionOfAudioAndSphere.z);
    // source.setMinDistance(0.1);
    source.setMaxDistance(7.0);
    source.setRolloff("linear"); // can be logarithmic, linear or none

    // source.setDirectivityPattern(alpha, sharpness)
    // alpha:  where 0 is an omnidirectional pattern, 1 is a bidirectional pattern, 0.5 is a cardiod pattern
    // More info here: https://resonance-audio.github.io/resonance-audio/reference/web/Source
    // source.setDirectivityPattern(0.5, 5); // this will only play the sound only to the front of the sphere (pointing towards the camera)
    source.setDirectivityPattern(0, 1); // this will play sound all around the sphere
}

// Sound Effect part

function playAudio() {
    // Play the audio.
    audioElement.play();
    audioIsPlaying = true;
}

function createSoundScene() {
    // have to set AudioContext for different browsers
    const AudioContext = window.AudioContext || window.webkitAudioContext || false;
    window.AudioContext = AudioContext;

    soundEffectContext = new AudioContext();

    // Create a Resonance Audio scene and pass it he AudioContext.
    resonanceSoundEffectScene = new ResonanceAudio(soundEffectContext);

    // Connect the scene’s binaural output to stereo out.
    resonanceSoundEffectScene.output.connect(soundEffectContext.destination);
}

function soundEffect() {
    soundEffectElement = document.createElement('audio')
    const url = 'https://cdn.glitch.global/456b0838-c3cc-4d61-813a-09dd332d684e/stingers-001-6294%20(mp3cut.net)%20(1).mp3?v=1692710577442'
    soundEffectElement.src = url;
    soundEffectElement.crossOrigin = 'anonymous';

    // Generate a MediaElementSource from the SoundEffectElement.
    const soundEffectElementSource = soundEffectContext.createMediaElementSource(
        soundEffectElement
    );

    // Add the MediaElementSource to the scene as an audio input source.
    const source = resonanceSoundEffectScene.createSource();
    soundEffectElementSource.connect(source.input);

    // Set the source position relative to the room center (source default position).
    // More API references here: https://resonance-audio.github.io/resonance-audio/reference/web/Source
    source.setPosition(positionOfAudioAndSphere.x, positionOfAudioAndSphere.y, positionOfAudioAndSphere.z);
    source.setMinDistance(0.0);
    source.setMaxDistance(4.5);
    source.setRolloff("linear"); // can be logarithmic, linear or none

    // source.setDirectivityPattern(alpha, sharpness)
    // alpha:  where 0 is an omnidirectional pattern, 1 is a bidirectional pattern, 0.5 is a cardiod pattern
    // More info here: https://resonance-audio.github.io/resonance-audio/reference/web/Source
    // source.setDirectivityPattern(0.5, 5); // this will only play the sound only to the front of the sphere (pointing towards the camera)
    source.setDirectivityPattern(1, 1); // this will play sound all around the sphere

}

function playSoundEffect() {
    soundEffectElement.play()
}

/**
 * Helper functions
 */


function getCameraPosition() {
    return camera.position;
}

function getCameraRotation() {
    const rotation = new THREE.Quaternion();
    rotation.setFromRotationMatrix(camera.matrixWorld);
    return rotation;
}

function getCameraDirectionNormalized() {
    // Get the camera direction
    const quat = getCameraRotation();
    const cameraDirection = new THREE.Vector3(0, 0, -1);
    cameraDirection.applyQuaternion(quat);
    cameraDirection.normalize()
    return cameraDirection;
}

function createVectorXDistanceAwayFromCamera(distanceFromCamera) {
    // we create a temporary vector that we will pass in the camera position and rotation to
    const vector = new THREE.Vector3();

    // order is important in steps 1-3!
    // step 1: get rotation from the camera
    // update the vector so it points in the same direction as the camera
    camera.getWorldDirection(vector);

    // step 2: scale the vector a bit so it reachs out in front (not on top) of the camera
    vector.multiplyScalar(distanceFromCamera);

    // step 3: get the position from the camera
    // adjust the position of the vector so it's in line with where the camera is (+ the distanceFromCamera)
    vector.add(camera.position);

    return vector;
}


// Raycast line helper
// a line to visualize the raycast.

function createRaycastLine() {
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    const lineGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(2 * 3); // 2 points x 3 vertices per point
    lineGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
    );
    line = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(line);
}

// this function is just here as a helper to visualize the raycast line (as an approximate)
// you can comment it out and raycast still works as it does not directly do the raycast function
function updateRaycasterHelperLine() {
    const positionStart = createVectorXDistanceAwayFromCamera(0);
    const positionEnd = createVectorXDistanceAwayFromCamera(200);
    const positions = line.geometry.attributes.position.array;

    positions[0] = positionEnd.x; // end x
    positions[1] = positionEnd.y; // end y
    positions[2] = positionEnd.z; // end z
    positions[3] = positionStart.x; // origin x
    positions[4] = positionStart.y - 0.2; // origin y. we push the origin a bit down to visualize it better
    positions[5] = positionStart.z; // origin z

    line.geometry.attributes.position.needsUpdate = true;
}
