import * as THREE from "npm:three"
import { fromArrayBuffer, GeoTIFF, GeoTIFFImage } from "npm:geotiff"

async function loadGeoTiff(url: string): Promise<GeoTIFFImage> {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const tiff: GeoTIFF = await fromArrayBuffer(arrayBuffer)
    return await tiff.getImage()
}

interface ElevationSource {
    image: GeoTIFFImage
    bounds: [number, number, number, number] // [minX, minY, maxX, maxY]
    resolution: [number, number, number] // [x, y, z] pixel scale
}

async function createElevationSource(
    image: GeoTIFFImage,
): Promise<ElevationSource> {
    return {
        image,
        bounds: await image.getBoundingBox(),
        resolution: await image.getResolution(),
    }
}

async function createTerrainGeometry(
    source: ElevationSource,
    scale: number = 1,
): Promise<THREE.PlaneGeometry> {
    const width = source.image.getWidth()
    const height = source.image.getHeight()
    const data = await source.image.readRasters({ interleave: true })

    // Calculate real-world dimensions
    const realWidth = Math.abs(source.bounds[2] - source.bounds[0])
    const realHeight = Math.abs(source.bounds[3] - source.bounds[1])

    const geometry = new THREE.PlaneGeometry(
        realWidth,
        realHeight,
        width - 1,
        height - 1,
    )

    const vertices = geometry.attributes.position.array as Float32Array

    for (let i = 0, j = 0; i < vertices.length; i += 3, j++) {
        let z = (data as Float32Array)[j] * scale

        // Clamp extreme values
        if (z < -10000 || z > 10000) {
            z = -1
        }

        vertices[i + 2] = z
    }

    geometry.computeVertexNormals()
    geometry.rotateX(-Math.PI / 2)
    return geometry
}

export async function renderDualResolutionTerrain(
    baseTiffUrl: string,
    highResTiffUrl: string,
    scale: number = 1,
): Promise<{
    sea: THREE.Mesh
    baseTerrain: THREE.Mesh
    highResTerrain: THREE.Mesh
}> {
    // Load both images
    const [baseImage, highResImage] = await Promise.all([
        loadGeoTiff(baseTiffUrl),
        loadGeoTiff(highResTiffUrl),
    ])

    // Create elevation sources
    const [baseTiff, highResTiff] = await Promise.all([
        createElevationSource(baseImage),
        createElevationSource(highResImage),
    ])

    console.log("Base bounds:", baseTiff.bounds)
    console.log("High-res bounds:", highResTiff.bounds)
    console.log("Base resolution:", baseTiff.resolution)
    console.log("High-res resolution:", highResTiff.resolution)

    // Create geometries for both resolutions
    const [baseGeometry, highResGeometry] = await Promise.all([
        createTerrainGeometry(baseTiff, scale),
        createTerrainGeometry(highResTiff, scale),
    ])

    const textureLoader = new THREE.TextureLoader()
    const texture = textureLoader.load("texture3.jpg")
    const bumpMap = textureLoader.load("bump.jpg")

    texture.wrapS = THREE.ClampToEdgeWrapping
    texture.wrapT = THREE.ClampToEdgeWrapping
    bumpMap.wrapS = THREE.ClampToEdgeWrapping
    bumpMap.wrapT = THREE.ClampToEdgeWrapping

    // Create materials - using slightly different colors to distinguish meshes
    const baseMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        bumpMap: bumpMap,
        bumpScale: 1.5,
    })

    const highResMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        bumpMap: bumpMap,
        bumpScale: 1.5,
        // Slightly different color for debugging
        // color: 0xcccccc,
    })

    // Create meshes
    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial)
    const highResMesh = new THREE.Mesh(highResGeometry, highResMaterial)

    // Position high-res mesh relative to base mesh
    // Convert from world coordinates to local space
    const baseWidth = Math.abs(baseTiff.bounds[2] - baseTiff.bounds[0])
    const baseHeight = Math.abs(baseTiff.bounds[3] - baseTiff.bounds[1])

    const highResX =
        ((highResTiff.bounds[0] - baseTiff.bounds[0]) / baseWidth) * baseWidth -
        baseWidth / 2
    const highResY =
        ((highResTiff.bounds[1] - baseTiff.bounds[1]) / baseHeight) *
            baseHeight -
        baseHeight / 2

    highResMesh.position.set(highResX, highResY, 0.1) // Slight z-offset to prevent z-fighting

    // Set up shadows
    baseMesh.receiveShadow = true
    baseMesh.castShadow = true
    highResMesh.receiveShadow = true
    highResMesh.castShadow = true

    // Create sea level mesh using base dimensions
    const seaLevelGeometry = new THREE.PlaneGeometry(
        Math.abs(baseTiff.bounds[2] - baseTiff.bounds[0]),
        Math.abs(baseTiff.bounds[3] - baseTiff.bounds[1]),
    )

    const seaLevelMaterial = new THREE.MeshPhongMaterial({
        color: 0x284356,
        bumpMap: bumpMap,
        bumpScale: 2,
        shininess: 150,
        opacity: 0.75,
        transparent: true,
    })

    const seaLevelMesh = new THREE.Mesh(seaLevelGeometry, seaLevelMaterial)
    seaLevelMesh.position.set(0, 0, 0)
    seaLevelMesh.rotation.x = -Math.PI / 2

    return {
        sea: seaLevelMesh,
        baseTerrain: baseMesh,
        highResTerrain: highResMesh,
    }
}
