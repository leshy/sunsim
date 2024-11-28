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

import { renderTiff } from "./tiff.ts"
window.THREE = THREE

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

    constructor() {
        this.init()
    }

    private init(): void {
        this.initScene()
        this.initRenderer()
        this.initPostProcessing()
        this.initControls()
        this.initStats()

        document.body.appendChild(this.renderer.domElement)
        window.addEventListener("resize", () => this.onWindowResize())
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
        this.setupGeometry()
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

        this.dirLight = new THREE.DirectionalLight(0xfeffed, 4)
        this.dirLight.name = "Dir. Light"
        this.dirLight.position.set(15000, -15000, 7500)
        this.configureDirectionalLight()

        this.scene.add(this.dirLight)
        this.scene.add(new THREE.CameraHelper(this.dirLight.shadow.camera))
    }

    private configureDirectionalLight(): void {
        this.dirLight.castShadow = true
        this.dirLight.shadow.camera.near = 1
        this.dirLight.shadow.camera.far = 300
        this.dirLight.shadow.camera.right = 150
        this.dirLight.shadow.camera.left = -150
        this.dirLight.shadow.camera.top = 150
        this.dirLight.shadow.camera.bottom = -150
        this.dirLight.shadow.mapSize.width = 1024 * 10
        this.dirLight.shadow.mapSize.height = 1024 * 10
    }

    private setupGeometry(): void {
        const material = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            shininess: 150,
            specular: 0x222222,
        })

        const geometry = new THREE.BoxGeometry(30, 30, 30)
        this.cube = new THREE.Mesh(geometry, material)
        this.cube.position.set(8, 150, 8)
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
            })

            //            terrain2Result.terrain.position.set(-2220, 1370, -44)

            const terrain1Result = await renderTiff("elevation.tiff", {
                zScale: 1,
                textureUrl: "elevation.jpg",
                bumpmapUrl: "elevationBump.jpg",
                genSea: false,
                overlapGeometry: terrain2Result.geometry,
                wireframe: true,
                bumpScale: 1.5,
            })

            if (terrain1Result.sea) {
                this.scene.add(terrain1Result.sea)
            }

            this.scene.add(terrain1Result.terrain)
            this.scene.add(terrain2Result.terrain)

            window.terrain2 = terrain2Result.terrain
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

        this.cube.rotation.x += 0.25 * delta * 0.25
        this.cube.rotation.y += 2 * delta * 0.25
        this.cube.rotation.z += 1 * delta * 0.25
    }

    public dispose(): void {
        window.removeEventListener("resize", () => this.onWindowResize())
        this.controls.dispose()
        this.renderer.dispose()
        this.composer.dispose()
        this.stats.dom.remove()
    }
}

window.s = new SceneManager()
