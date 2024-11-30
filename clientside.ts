import * as THREE from "npm:three"
import Stats from "npm:three/addons/libs/stats.module.js"
import { OrbitControls } from "npm:three/addons/controls/OrbitControls.js"
import { EffectComposer } from "npm:three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "npm:three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "npm:three/addons/postprocessing/UnrealBloomPass.js"
import { FilmPass } from "npm:three/addons/postprocessing/FilmPass.js"
import { ShaderPass } from "npm:three/addons/postprocessing/ShaderPass.js"
import { FXAAShader } from "npm:three/addons/shaders/FXAAShader.js"
import { GammaCorrectionShader } from "npm:three/addons/shaders/GammaCorrectionShader.js"

import * as dftz from "npm:date-fns-tz"

import GUI from "npm:lil-gui"

import { renderTiff } from "./tiff.ts"
import * as stitch from "./tiffstitch.ts"
import * as geom from "./tiffgeom.ts"
import * as SunCalc from "npm:suncalc"
import * as df from "npm:date-fns"

window.df = df
window.stitch = stitch
window.geom = geom

globalThis.THREE = THREE

function dateForTz(hour: number, month: number): Date {
    const year = new Date().getFullYear()

    // Extract minutes from hour decimal
    const wholeHour = Math.floor(hour)
    const minutes = Math.round((hour - wholeHour) * 60)

    // Extract days from month decimal (1-based)
    const wholeMonth = Math.floor(month)
    const days = Math.floor(
        (month - wholeMonth) * new Date(year, wholeMonth, 0).getDate(),
    ) + 1

    const dateString = `${year}-${wholeMonth.toString().padStart(2, "0")}-${
        days
            .toString()
            .padStart(2, "0")
    } ${wholeHour.toString().padStart(2, "0")}:${
        minutes
            .toString()
            .padStart(2, "0")
    }:00`

    console.log(dateString)

    return dftz.fromZonedTime(new Date(dateString), "Europe/Athens")
}

class SceneManager {
    private camera: THREE.PerspectiveCamera
    private scene: THREE.Scene
    private renderer: THREE.WebGLRenderer
    private composer: EffectComposer
    private clock: THREE.Clock
    private stats: Stats
    private dirLight: THREE.DirectionalLight
    private ambientLight: THREE.AmbientLight
    private cube: THREE.Mesh
    private readonly SUN_RADIUS: number = 15000
    private controls: OrbitControls
    private sunSphere: THREE.Mesh

    constructor() {
        this.init()
    }

    private init(): void {
        this.initScene()
        this.initRenderer()
        this.initPostProcessing()
        this.initControls()
        this.initGUI()
        this.initStats()

        document.body.appendChild(this.renderer.domElement)
        window.addEventListener("resize", () => this.onWindowResize())
    }
    private initGUI(): void {
        const gui = new GUI()
        const params = {
            hour: 12,
            month: 6,
        }

        gui.add(params, "hour", 0, 24).onChange((hour: number) => {
            this.sun(hour, params.month)
        })

        gui.add(params, "month", 1, 12).onChange((month: number) => {
            this.sun(params.hour, month)
        })
    }
    private initScene(): void {
        this.camera = new THREE.PerspectiveCamera(
            45,
            window.innerWidth / window.innerHeight,
            20,
            100000,
        )
        this.camera.position.set(0, 0, 12500)
        this.camera.up.set(0, 0, 1)

        this.scene = new THREE.Scene()
        //this.scene.fog = new THREE.Fog(0xcccccc, 100, 15000)

        this.setupLights()
        this.createSunSphere()
        // this.setupGeometry()
        this.loadTerrains()
    }

    private initPostProcessing(): void {
        this.composer = new EffectComposer(this.renderer)

        // Regular scene render
        const renderPass = new RenderPass(this.scene, this.camera)
        this.composer.addPass(renderPass)

        // Bloom effect
        // const bloomPass = new UnrealBloomPass(
        //     new THREE.Vector2(window.innerWidth, window.innerHeight),
        //     1.0,
        //     0.4,
        //     0.85,
        // )
        // this.composer.addPass(bloomPass)

        // Film grain effect
        //const filmPass = new FilmPass(0.35, 0.025, 648, false)
        //this.composer.addPass(filmPass)

        // FXAA anti-aliasing
        // const fxaaPass = new ShaderPass(FXAAShader)
        // fxaaPass.material.uniforms["resolution"].value.set(
        //     1 / window.innerWidth,
        //     1 / window.innerHeight,
        // )
        // //fxaaPass.uniforms["gamma"].value = 0.85 // Adjust this value to control brightness
        // window.fxaa = fxaaPass
        //this.composer.addPass(fxaaPass)

        // FXAA anti-aliasing
        const gammaPass = new ShaderPass(GammaCorrectionShader)
        this.composer.addPass(gammaPass)
    }

    private setupLights(): void {
        this.ambientLight = new THREE.AmbientLight(0x404040, 2)
        this.scene.add(this.ambientLight)

        this.dirLight = new THREE.DirectionalLight(0xffeecc, 4)
        this.dirLight.name = "Dir. Light"
        //        this.dirLight.position.set(15000, -15000, 5000)
        this.dirLight.position.set(12000, 8000, 6000)
        this.configureDirectionalLight()

        this.scene.add(this.dirLight)
        // this.scene.add(new THREE.CameraHelper(this.dirLight.shadow.camera))
    }

    public shadowThicc(thicc: number = 10000) {
        this.dirLight.shadow.camera.right = thicc
        this.dirLight.shadow.camera.left = -thicc
        this.dirLight.shadow.camera.top = thicc
        this.dirLight.shadow.camera.bottom = -thicc
    }

    private configureDirectionalLight(): void {
        this.dirLight.castShadow = true
        this.dirLight.shadow.camera.near = 1
        this.dirLight.shadow.camera.far = 30000
        this.dirLight.shadow.mapSize.width = 1024 * 6
        this.dirLight.shadow.mapSize.height = 1024 * 6
        this.shadowThicc(3000)
    }

    private createSunSphere() {
        // Create the main sun
        const sunMaterial = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0xffff00,
            emissiveIntensity: 1,
            toneMapped: false,
        })
        const sunGeometry = new THREE.SphereGeometry(750, 32, 32)
        const sunSphere = new THREE.Mesh(sunGeometry, sunMaterial)
        sunSphere.castShadow = false
        sunSphere.receiveShadow = false

        // Create glow effect using a larger sphere with transparent material
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide,
        })
        const glowGeometry = new THREE.SphereGeometry(850, 32, 32)
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial)
        sunSphere.add(glowMesh) // Add glow as child of sun

        // Store reference and add to scene
        this.sunSphere = sunSphere
        this.scene.add(sunSphere)
        this.sun(8, 7)
    }

    private setupGeometry(): void {
        const material = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            shininess: 150,
            specular: 0x222222,
        })

        const geometry = new THREE.BoxGeometry(100, 100, 100)
        this.cube = new THREE.Mesh(geometry, material)
        this.cube.position.set(-2000, 1200, 200)
        this.cube.castShadow = true
        this.cube.receiveShadow = true
        this.scene.add(this.cube)
    }

    private async loadTerrains(): Promise<void> {
        try {
            const terrain2Result = await renderTiff("elevationHighres.tiff", {
                zScale: 1,
                textureUrl: "elevationHighres4.jpg",
                bumpmapUrl: "elevationHighresBump.jpg",
                wireframe: false,
            })

            const terrain1Result = await renderTiff("elevationHole.tiff", {
                zScale: 1,
                textureUrl: "elevation.jpg",
                bumpmapUrl: "elevationBump.jpg",
                genSea: true,
                overlapGeometry: terrain2Result,
                overlapZoffset: -45,
                wireframe: false,
                bumpScale: 1.5,
            })

            if (terrain1Result.sea) {
                this.scene.add(terrain1Result.sea)
            }

            if (terrain1Result.debugElements) {
                for (const element of terrain1Result.debugElements) {
                    this.scene.add(element)
                }
            }

            this.scene.add(terrain1Result.terrain)
            this.scene.add(terrain2Result.terrain)

            window.terrain1 = terrain1Result
            window.terrain2 = terrain2Result

            this.dirLight.target.position.set(
                ...geom
                    .analyzeGeometryCenter(terrain2Result.geometry)
                    .toArray(),
            )
            this.dirLight.target.updateMatrixWorld()
        } catch (error) {
            console.error("Error loading terrains:", error)
        }
    }

    private initRenderer(): void {
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setPixelRatio(window.devicePixelRatio)
        this.renderer.setSize(window.innerWidth, window.innerHeight)

        this.renderer.setAnimationLoop(() => this.animate())
        this.renderer.physicallyCorrectLights = true
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

        this.clock = new THREE.Clock()
    }

    private initControls(): void {
        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement,
        )

        this.controls.target.set(-2220, 1370, -44)
        this.controls.update()
    }

    private initStats(): void {
        this.stats = new Stats()
        document.body.appendChild(this.stats.dom)
    }

    private onWindowResize(): void {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.composer.setSize(window.innerWidth, window.innerHeight)

        // Update FXAA uniforms
        const fxaaPass = this.composer.passes.find(
            (pass) =>
                pass instanceof ShaderPass &&
                pass.material.uniforms["resolution"],
        ) as ShaderPass
        if (fxaaPass) {
            fxaaPass.material.uniforms["resolution"].value.set(
                1 / window.innerWidth,
                1 / window.innerHeight,
            )
        }
    }

    private animate(): void {
        this.render()
        this.stats.update()
    }

    private render(): void {
        const delta = this.clock.getDelta()

        // Use composer instead of renderer
        this.composer.render()

        // this.cube.rotation.x += 0.25 * delta * 0.25
        // this.cube.rotation.y += 2 * delta * 0.25
        // this.cube.rotation.z += 1 * delta * 0.25
    }

    public dispose(): void {
        window.removeEventListener("resize", () => this.onWindowResize())
        this.controls.dispose()
        this.renderer.dispose()
        this.composer.dispose()
        this.stats.dom.remove()
    }

    public sun(hour: number, month: number): void {
        const date = dateForTz(hour, month)
        console.log(date)

        this.placeSun(date)
    }

    public placeSun(datetime: Date, distance: number = 17500): void {
        // Fixed coordinates for the location
        const latitude = 38.5038463475032
        const longitude = 24.00044844431349

        // Get sun position from SunCalc
        const sunPosition = SunCalc.getPosition(datetime, latitude, longitude)
        console.log("sunPos", sunPosition)

        // Convert to three.js coordinates, rotating around current target
        const phi = Math.PI / 2 - sunPosition.altitude // Angle from zenith
        const theta = sunPosition.azimuth // Azimuth from south

        // Get the target position
        const targetPos = this.dirLight.target.position

        // Convert spherical coordinates to cartesian, relative to target
        // X = East (positive), Y = North (positive), Z = Up
        const x = targetPos.x - distance * Math.sin(phi) * Math.sin(theta) // Negated for correct East/West
        const y = targetPos.y - distance * Math.sin(phi) * Math.cos(theta) // North component
        const z = targetPos.z + distance * Math.cos(phi) // Up component

        // Position the light
        this.dirLight.position.set(x, y, z)
        this.sunSphere.position.copy(this.dirLight.position)
    }
}

globalThis.s = new SceneManager()
