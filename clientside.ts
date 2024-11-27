import * as THREE from "npm:three"
import Stats from "npm:three/addons/libs/stats.module.js"
import { OrbitControls } from "npm:three/addons/controls/OrbitControls.js"
import { renderTiff } from "./tiff.ts"

let camera, scene, renderer, clock, stats
let dirLight, cube

init()

function init() {
    initScene()
    initMisc()

    document.body.appendChild(renderer.domElement)
    window.addEventListener("resize", onWindowResize)
}

function initScene() {
    camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        100,
        100000,
    )

    camera.position.set(0, 7500, 0)

    scene = new THREE.Scene()

    // Lights
    scene.add(new THREE.AmbientLight(0x404040, 1))

    dirLight = new THREE.DirectionalLight(0xfeffed, 3)
    dirLight.name = "Dir. Light"
    dirLight.position.set(10000, 10000, 10000)
    dirLight.castShadow = true
    dirLight.shadow.camera.near = 1
    dirLight.shadow.camera.far = 300
    dirLight.shadow.camera.right = 150
    dirLight.shadow.camera.left = -150
    dirLight.shadow.camera.top = 150
    dirLight.shadow.camera.bottom = -150
    dirLight.shadow.mapSize.width = 1024 * 10
    dirLight.shadow.mapSize.height = 1024 * 10
    scene.add(dirLight)

    scene.add(new THREE.CameraHelper(dirLight.shadow.camera))

    // Geometry
    let geometry = new THREE.TorusKnotGeometry(25, 8, 75, 20)
    let material = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        shininess: 150,
        specular: 0x222222,
    })

    geometry = new THREE.BoxGeometry(3, 3, 3)
    cube = new THREE.Mesh(geometry, material)
    cube.position.set(8, 15, 8)
    cube.castShadow = true
    cube.receiveShadow = true
    scene.add(cube)

    // geometry = new THREE.BoxGeometry(10000, 10000, 10000)
    // const cube2 = new THREE.Mesh(geometry, material)
    // cube2.position.set(8, 15, 8)
    // scene.add(cube2)

    geometry = new THREE.BoxGeometry(30, 0.15, 30)

    material = new THREE.MeshPhongMaterial({
        color: 0xa0adaf,
        shininess: 150,
        specular: 0x111111,
    })

    // const ground = new THREE.Mesh(geometry, material)
    // ground.scale.multiplyScalar(3)
    // ground.castShadow = false
    // ground.receiveShadow = true
    // scene.add(ground)

    renderTiff("elevation2.tiff", 1, 25).then(({ terrain, sea }) => {
        scene.add(sea)
        scene.add(terrain)
        console.log("added mesh", terrain)
    })
}

function initMisc() {
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setAnimationLoop(animate)
    renderer.physicallyCorrectLights = true // Use physically accurate lighting

    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // Mouse control
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 2, 0)
    controls.update()

    clock = new THREE.Clock()

    stats = new Stats()
    document.body.appendChild(stats.dom)
}
4

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()

    renderer.setSize(window.innerWidth, window.innerHeight)
}

function animate() {
    render()
    stats.update()
}

function renderScene() {
    renderer.render(scene, camera)
}

const SUN_RADIUS = 15000 // Distance of the sun (light) from the scene
let sunAngle = 0
// Utility to interpolate between two colors
function blendColors(color1, color2, factor) {
    const c1 = new THREE.Color(color1)
    const c2 = new THREE.Color(color2)
    return c1.lerp(c2, factor)
}

function render() {
    const delta = clock.getDelta()

    renderScene()

    // Animate cube rotations
    cube.rotation.x += 0.25 * delta * 0.25
    cube.rotation.y += 2 * delta * 0.25
    cube.rotation.z += 1 * delta * 0.25

    // // Simulate sun movement
    // sunAngle += delta * 0.25 // Adjust speed of the sun's rotation

    // // Skip the "night" portion
    // if (sunAngle > Math.PI) {
    //     sunAngle = 0 // Jump back to sunrise
    // }

    // // Update light position
    // dirLight.position.set(
    //     SUN_RADIUS * Math.cos(sunAngle), // X (orbit)
    //     SUN_RADIUS * Math.sin(sunAngle), // Y (orbit)
    //     1000, // Z (elevation)
    // )

    // // Adjust light color and intensity based on sun angle
    // const t = sunAngle / Math.PI // Normalize the sunAngle to [0, 1]
    // const r = 0xfe * (1 - t) + 0xfe * t // Red fades from 0xfe to 0xfe (unchanged)
    // const g = 0xff * (1 - t) + 0xff * t // Green fades from 0xff to 0xff (unchanged)
    // const b = 0xed // Blue stays constant

    // dirLight.color.setRGB(r / 255, g / 255, b / 255) // Set smooth RGB transition
    // dirLight.intensity = 0.5 + t * 2.5 // Smooth intensity increase
}
