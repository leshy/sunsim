import * as THREE from "npm:three"
import GeoTIFF, { fromArrayBuffer, GeoTIFFImage } from "npm:geotiff"

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
    const tiff: GeoTIFF.GeoTIFF = await fromArrayBuffer(arrayBuffer)
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
    scale: number = 1,
): THREE.PlaneGeometry {
    const geometry = new THREE.PlaneGeometry(
        width,
        height,
        width - 1,
        height - 1,
    )

    const vertices = geometry.attributes.position.array as Float32Array

    for (let i = 0, j = 0; i < vertices.length; i += 3, j++) {
        let z = data[j] * scale
        // Debug extreme values
        if (z < -10000 || z > 10000) {
            //            console.warn(`Extreme elevation valu at index ${j}: ${z}`)
            z = -0.1
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
    scale: number,
): Promise<THREE.Group> {
    const { data, width, height } = await loadGeoTiff(url)

    // Create the elevation geometry
    const elevationGeometry = createElevationGeometry(
        data,
        width,
        height,
        scale,
    )

    //const elevationMaterial = new THREE.MeshStandardMaterial({
    //    color: 0x88cc88, // Green for terrain
    //    wireframe: false,
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
    const seaLevelGeometry = new THREE.PlaneGeometry(width, height)

    const seaLevelMaterial = new THREE.MeshStandardMaterial({
        color: 0x0000ff, // Blue for sea
        //opacity: 0.5, // Slight transparency
        //transparent: true,
    })
    const seaLevelMesh = new THREE.Mesh(seaLevelGeometry, seaLevelMaterial)

    // Position the sea level mesh to align with the terrain
    seaLevelMesh.position.set(0, 0, 0) // Centered at (0, 0, 0)
    seaLevelMesh.rotation.x = -Math.PI / 2 // Align the plane to match Three.js's world

    // Group both meshes together
    const group = new THREE.Group()
    group.add(terrainMesh)
    //group.add(overlayMesh)
    group.add(seaLevelMesh)

    return group
}
