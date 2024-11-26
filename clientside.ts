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

    scene.add(new THREE.AmbientLight(0x404040, 3))

    dirLight = new THREE.DirectionalLight(0xffffff, 3)
    dirLight.name = "Dir. Light"
    dirLight.position.set(100, 100, 100)
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

    renderTiff("elevation.tiff", 2, 25).then(({ sea, terrain, transform }) => {
        //mesh.receiveShadow = true
        //mesh.castShadow = false
        scene.add(sea)
        scene.add(terrain)
        console.log("added mesh", sea, terrain)
    })
}

function initMisc() {
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setAnimationLoop(animate)
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

function render() {
    const delta = clock.getDelta()

    renderScene()

    cube.rotation.x += 0.25 * delta * 0.25
    cube.rotation.y += 2 * delta * 0.25
    cube.rotation.z += 1 * delta * 0.25
}
