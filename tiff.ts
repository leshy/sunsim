import * as THREE from "npm:three"

import { fromArrayBuffer, GeoTIFF, GeoTIFFImage } from "npm:geotiff"

import {
    alignGeometries,
    alignMeshes,
    analyzeGeometryCenter,
    createElevationGeometry,
} from "./tiffgeom.ts"

const textureLoader = new THREE.TextureLoader()

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
    overlapGeometry?: RenderTiffOutput
    wireframe?: boolean
    overlapZoffset?: number
}

export type RenderTiffOutput = {
    terrain: THREE.Mesh
    tiff: GeoTIFFImage
    sea?: THREE.Mesh
    geometry: THREE.BufferGeometry
    material: THREE.Material
    debugElements?: Array<any>
}

// Main function to load and render
export async function renderTiff(
    url: string,
    opts: RenderTiffOpts = {},
): Promise<RenderTiffOutput> {
    const image = await loadGeoTiff(url)
    const ret: Partial<RenderTiffOutput> = { tiff: image }

    // Create the elevation geometry
    ret.geometry = await createElevationGeometry(
        image,
        opts.zScale ? opts.zScale : 1,
    )

    if (opts.overlapGeometry) {
        alignGeometries(
            image,
            opts.overlapGeometry.tiff,
            opts.overlapGeometry.geometry,
            opts.overlapZoffset,
        )

        // console.log("stitching")
        // ret.geometry = stitch.mergeTerrainGeometries(
        //     ret.geometry,
        //     opts.overlapGeometry.geometry,
        // )
        // console.log("done")

        // ret.geometry = overlap.cutHole(
        //     ret.geometry,
        //     opts.overlapGeometry.terrain,
        // )

        // //ret.debugElements = overlap.removeOverlappingVertices(
        // //    ret.geometry,
        // //    opts.overlapGeometry.terrain,
        // //)
    }

    if (opts.wireframe) {
        ret.material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
        })
    } else {
        // Create a material with the texture and bump map
        ret.material = new THREE.MeshStandardMaterial({
            ...getTextureBumpamp(opts),
        })
    }

    // let elevationMaterial = new THREE.MeshPhongMaterial({
    //     color: 0x88cc88,
    //     shininess: 150,
    //     specular: 0x111111,
    // })

    const terrainMesh = new THREE.Mesh(ret.geometry, ret.material)

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
        seaBumpTexture.repeat.set(6, 6) // Adjust tiling frequency (4x4 as an example)

        const seaLevelMaterial = new THREE.MeshPhongMaterial({
            //color: 0x5085aa, // Blue for sea
            color: 0xa7c2d4,
            bumpScale: 2,
            shininess: 150,
            opacity: 1, // Slight transparency
            transparent: true,
            ...getTextureBumpamp(opts),
            bumpMap: seaBumpTexture,
        })

        const seaLevelMesh = new THREE.Mesh(seaLevelGeometry, seaLevelMaterial)

        // Position the sea level mesh to align with the terrain
        seaLevelMesh.position.set(0, 0, 0) // Centered at (0, 0, 0)
        // Align the plane to match Three.js's world
        ret.sea = seaLevelMesh
    }

    ret.terrain.receiveShadow = true
    ret.terrain.castShadow = true

    return ret as RenderTiffOutput
}
