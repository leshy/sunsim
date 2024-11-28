import * as THREE from "npm:three"
import {
    fromArrayBuffer,
    GeoTIFF,
    GeoTIFFImage,
    ReadRasterResult,
} from "npm:geotiff"
const textureLoader = new THREE.TextureLoader()

async function createElevationGeometry(
    image: GeoTIFFImage,
    scale: number = 1,
): THREE.BufferGeometry {
    const width = image.getWidth()
    const height = image.getHeight()
    const data: ReadRasterResult = await image.readRasters({
        interleave: true,
    })
    const resolution = image.getResolution()
    if (resolution[2]) {
        scale = resolution[2] * scale
    }
    const realWidth = Math.abs(resolution[0]) * (width - 1)
    const realHeight = Math.abs(resolution[1]) * (height - 1)
    const vertices: number[] = []
    const indices: number[] = []
    const validVertexIndices = new Map<number, number>()
    const uvs: number[] = []

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const i = row * width + col
            const z = (data[i] as number) * scale
            if (z >= -10000 && z <= 10000) {
                const x = (col / (width - 1) - 0.5) * realWidth
                const y = ((height - 1 - row) / (height - 1) - 0.5) * realHeight
                validVertexIndices.set(i, vertices.length / 3)
                vertices.push(x, y, z)
                uvs.push(col / (width - 1), 1 - row / (height - 1))
            }
        }
    }

    // Second pass: create faces with flipped winding order
    for (let row = 0; row < height - 1; row++) {
        for (let col = 0; col < width - 1; col++) {
            const i0 = row * width + col
            const i1 = i0 + 1
            const i2 = i0 + width
            const i3 = i2 + 1
            const v0 = validVertexIndices.get(i0)
            const v1 = validVertexIndices.get(i1)
            const v2 = validVertexIndices.get(i2)
            const v3 = validVertexIndices.get(i3)
            if (v0 !== undefined && v1 !== undefined && v2 !== undefined) {
                // Flipped winding order for first triangle
                indices.push(v0, v2, v1)
            }
            if (v1 !== undefined && v2 !== undefined && v3 !== undefined) {
                // Flipped winding order for second triangle
                indices.push(v1, v2, v3)
            }
        }
    }

    const geometry = new THREE.BufferGeometry()
    const verticesFloat32 = new Float32Array(vertices)
    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(verticesFloat32, 3),
    )
    geometry.setAttribute(
        "uv",
        new THREE.BufferAttribute(new Float32Array(uvs), 2),
    )
    const indexArray = vertices.length / 3 > 65535
        ? new Uint32Array(indices)
        : new Uint16Array(indices)
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1))
    geometry.computeVertexNormals()
    return geometry
}

async function loadGeoTiff(url: string): Promise<GeoTIFFImage> {
    console.log(`Fetching GeoTIFF from ${url}`)
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    console.log(`Converting ArrayBuffer to GeoTIFF`, arrayBuffer.byteLength)
    const tiff: GeoTIFF = await fromArrayBuffer(arrayBuffer)
    const image: GeoTIFFImage = await tiff.getImage()
    console.log(image)
    return image
}

type TextureBumpmap = {
    map?: THREE.Texture
    bumpMap?: THREE.Texture
    bumpScale?: number
}

function getTextureBumpamp(opts: RenderTiffOpts): TextureBumpmap {
    const ret: TextureBumpmap = {}

    if (opts.textureUrl) {
        const texture = textureLoader.load(opts.textureUrl)
        ret.map = texture
    }

    if (opts.bumpmapUrl) {
        const bumpMap = textureLoader.load(opts.bumpmapUrl)
        ret.bumpMap = bumpMap
    }

    if (opts.bumpScale) {
        ret.bumpScale = opts.bumpScale
    }

    return ret
}

export type RenderTiffOpts = {
    textureUrl?: string
    bumpmapUrl?: string
    zScale?: number
    genSea?: boolean
    bumpScale?: number
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

    console.log("ELEVATION GEOM", elevationGeometry)

    // Create a material with the texture and bump map
    const elevationMaterial = new THREE.MeshStandardMaterial({
        ...getTextureBumpamp(opts),
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
            //terrainMesh.geometry.parameters.width,
            //terrainMesh.geometry.parameters.height,
            image.getWidth() * 25,
            image.getHeight() * 25,
            image.getWidth(),
            image.getHeight(),
        )

        const seaBumpTexture = textureLoader.load("seaBump.jpg")
        seaBumpTexture.wrapS = THREE.RepeatWrapping
        seaBumpTexture.wrapT = THREE.RepeatWrapping
        seaBumpTexture.repeat.set(5, 5) // Adjust tiling frequency (4x4 as an example)

        const seaLevelMaterial = new THREE.MeshPhongMaterial({
            //color: 0x5085aa, // Blue for sea
            bumpScale: 2,
            shininess: 150,
            opacity: 0.5, // Slight transparency
            transparent: true,

            ...getTextureBumpamp(opts),
            //bumpMap: seaBumpTexture,
        })

        const seaLevelMesh = new THREE.Mesh(seaLevelGeometry, seaLevelMaterial)

        // Position the sea level mesh to align with the terrain
        seaLevelMesh.position.set(0, 0, 0) // Centered at (0, 0, 0)
        // Align the plane to match Three.js's world
        ret.sea = seaLevelMesh
    }

    return ret as RenderTiffOutput
}
