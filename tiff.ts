import * as THREE from "npm:three"
import { fromArrayBuffer, GeoTIFF, GeoTIFFImage } from "npm:geotiff"

async function loadGeoTiff(url: string): Promise<GeoTIFFImage> {
    console.log(`Fetching GeoTIFF from ${url}`)
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    console.log(`Converting ArrayBuffer to GeoTIFF`, arrayBuffer.byteLength)
    const tiff: GeoTIFF = await fromArrayBuffer(arrayBuffer)
    const image: GeoTIFFImage = await tiff.getImage()
    window.image = image
    console.log(image)
    return image
}

// Create geometry using elevation data
async function createElevationGeometry(
    image: GeoTIFFImage,
    scale: number = 1,
): THREE.PlaneGeometry {
    const width = image.getWidth()
    const height = image.getHeight()
    const data: Float32Array | Uint16Array | Uint8Array = await image
        .readRasters({ interleave: true })

    const resolution = image.getResolution()

    if (resolution[2]) {
        scale = resolution[2] * scale
    }

    const realWidth = Math.abs(resolution[0]) * (width - 1) // Real-world width
    const realHeight = Math.abs(resolution[1]) * (height - 1) // Real-world height

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

type TextureBumpmap = {
    map?: THREE.Texture
    bumpMap?: THREE.Texture
}

function getTextureBumpamp(opts: RenderTiffOpts): TextureBumpmap {
    const ret: TextureBumpmap = {}
    const textureLoader = new THREE.TextureLoader()

    if (opts.textureUrl) {
        const texture = textureLoader.load(opts.textureUrl)
        texture.wrapS = THREE.ClampToEdgeWrapping
        texture.wrapT = THREE.ClampToEdgeWrapping
        ret.map = texture
    }

    if (opts.bumpmapUrl) {
        const bumpMap = textureLoader.load(opts.bumpmapUrl)
        bumpMap.wrapS = THREE.ClampToEdgeWrapping
        bumpMap.wrapT = THREE.ClampToEdgeWrapping
        ret.bumpMap = bumpMap
    }

    return ret
}

export type RenderTiffOpts = {
    textureUrl?: string
    bumpmapUrl?: string
    zScale?: number
    genSea?: boolean
}

export type RenderTiffOutput = {
    terrain: THREE.Mesh
    tiff: GeoTIFFImage
    sea?: THREE.Mesh
}

// Main function to load and render
export async function renderTiff(
    url: string,
    opts: RenderTiffOpts = {},
): Promise<RenderTiffOutput> {
    const image = await loadGeoTiff(url)
    const ret: Partial<RenderTiffOutput> = { tiff: image }

    // Create the elevation geometry
    const elevationGeometry = await createElevationGeometry(
        image,
        opts.zScale ? opts.zScale : 1,
    )

    // Create a material with the texture and bump map
    let elevationMaterial = new THREE.MeshStandardMaterial({
        ...getTextureBumpamp(opts),
        bumpScale: 1.5, // Control the intensity of the bump effect (adjust as needed)
    })

    // let elevationMaterial = new THREE.MeshPhongMaterial({
    //     color: 0x88cc88,
    //     shininess: 150,
    //     specular: 0x111111,
    // })

    const terrainMesh = new THREE.Mesh(elevationGeometry, elevationMaterial)
    terrainMesh.receiveShadow = true
    terrainMesh.castShadow = true

    ret.terrain = terrainMesh

    if (opts.genSea) {
        // Create a flat geometry at sea level
        const seaLevelGeometry = new THREE.PlaneGeometry(
            terrainMesh.geometry.parameters.width,
            terrainMesh.geometry.parameters.height,
            image.getWidth(),
            image.getHeight(),
        )

        const seaLevelMaterial = new THREE.MeshPhongMaterial({
            color: 0x284356, // Blue for sea
            bumpScale: 2,
            shininess: 150,
            opacity: 0.75, // Slight transparency
            transparent: true,
            ...getTextureBumpamp(opts),
        })

        const seaLevelMesh = new THREE.Mesh(seaLevelGeometry, seaLevelMaterial)

        // Position the sea level mesh to align with the terrain
        seaLevelMesh.position.set(0, 0, 0) // Centered at (0, 0, 0)
        seaLevelMesh.rotation.x = -Math.PI / 2
        // Align the plane to match Three.js's world
        ret.sea = seaLevelMesh
    }

    return ret
}
