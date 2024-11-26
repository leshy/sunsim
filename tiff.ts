import * as THREE from "npm:three"
import { fromArrayBuffer, GeoTIFF, GeoTIFFImage } from "npm:geotiff"

interface GeoTiffData {
    data: Float32Array | Uint16Array | Uint8Array // Elevation data
    width: number // Image width
    height: number // Image height
}

async function loadGeoTiff(url: string): Promise<GeoTiffData> {
    console.log(`Fetching GeoTIFF from ${url}`)
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    console.log(`Converting ArrayBuffer to GeoTIFF`, arrayBuffer.byteLength)
    const tiff: GeoTIFF = await fromArrayBuffer(arrayBuffer)
    const image: GeoTIFFImage = await tiff.getImage()
    console.log(image)
    const width = image.getWidth()
    const height = image.getHeight()
    const data: Float32Array | Uint16Array | Uint8Array = await image
        .readRasters({ interleave: true })
    return { data, width, height }
}

// Create geometry using elevation data
function createElevationGeometry(
    data: Float32Array | Uint16Array | Uint8Array,
    width: number,
    height: number,
    pixelSize: number, // Add pixel size (e.g., meters per pixel)
    scale: number = 1,
): THREE.PlaneGeometry {
    const realWidth = pixelSize * (width - 1) // Real-world width
    const realHeight = pixelSize * (height - 1) // Real-world height

    const geometry = new THREE.PlaneGeometry(
        realWidth,
        realHeight,
        width - 1,
        height - 1,
    )

    const vertices = geometry.attributes.position.array as Float32Array

    for (let i = 0, j = 0; i < vertices.length; i += 3, j++) {
        let z = data[j] * scale
        if (z < -10000 || z > 10000) {
            z = -1
        }
        vertices[i + 2] = z
    }

    geometry.computeVertexNormals()
    geometry.rotateX(-Math.PI / 2)

    return geometry
}

// Main function to load and render
export async function renderTiff(
    url: string,
    scale: number = 1,
    pixelSize: number = 1,
): Promise<{
    sea: THREE.Mesh
    terrain: THREE.Mesh
    transform: (x: number, y: number) => [number, number]
}> {
    const { data, width, height } = await loadGeoTiff(url)

    // Create the elevation geometry
    const elevationGeometry = createElevationGeometry(
        data,
        width,
        height,
        pixelSize,
        scale,
    )

    //const textureLoader = new THREE.TextureLoader()
    //const texture = textureLoader.load("texture.png")
    //    texture.wrapS = THREE.ClampToEdgeWrapping
    //    texture.wrapT = THREE.ClampToEdgeWrapping

    // Create a material with the texture
    //let elevationMaterial = new THREE.MeshPhongMaterial({
    //    map: texture, // Apply the texture
    //    shininess: 150,
    //    specular: 0x111111,
    //})

    let elevationMaterial = new THREE.MeshPhongMaterial({
        color: 0x88cc88,
        shininess: 150,
        specular: 0x111111,
    })

    const terrainMesh = new THREE.Mesh(elevationGeometry, elevationMaterial)
    terrainMesh.receiveShadow = true
    terrainMesh.castShadow = true

    // Create a flat geometry at sea level
    const seaLevelGeometry = new THREE.PlaneGeometry(
        width * pixelSize,
        height * pixelSize,
    )

    const seaLevelMaterial = new THREE.MeshStandardMaterial({
        color: 0x0000ff, // Blue for sea
        //opacity: 0.5, // Slight transparency
        //transparent: true,
    })
    const seaLevelMesh = new THREE.Mesh(seaLevelGeometry, seaLevelMaterial)

    // Position the sea level mesh to align with the terrain
    seaLevelMesh.position.set(0, 0, 0) // Centered at (0, 0, 0)
    seaLevelMesh.rotation.x = -Math.PI / 2 // Align the plane to match Three.js's world

    const transform = (x: number, y: number) => [x, y]

    return {
        sea: seaLevelMesh,
        terrain: terrainMesh,
        transform,
    }
}
