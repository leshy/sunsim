import * as THREE from "npm:three"
import { GeoTIFFImage, ReadRasterResult } from "npm:geotiff"

export function alignGeometries(
    sourceTiff: GeoTIFFImage,
    targetTiff: GeoTIFFImage,
    geometryToTransform: THREE.BufferGeometry,
    offsetZ: number = 0,
): void {
    console.log("Aligning geometries", offsetZ)
    // Get bounding boxes
    const [srcMinX, srcMinY, srcMaxX, srcMaxY] = sourceTiff.getBoundingBox()
    const [tgtMinX, tgtMinY, tgtMaxX, tgtMaxY] = targetTiff.getBoundingBox()

    // Calculate centers
    const srcCenterX = (srcMaxX + srcMinX) / 2
    const srcCenterY = (srcMaxY + srcMinY) / 2
    const tgtCenterX = (tgtMaxX + tgtMinX) / 2
    const tgtCenterY = (tgtMaxY + tgtMinY) / 2

    // Calculate offset from target to source (reversed from before)
    const offsetX = tgtCenterX - srcCenterX
    const offsetY = tgtCenterY - srcCenterY

    // Create and apply transformation matrix
    const matrix = new THREE.Matrix4().makeTranslation(
        offsetX,
        offsetY,
        offsetZ,
    )
    geometryToTransform.applyMatrix4(matrix)

    // Recompute normals since we've transformed the geometry
    geometryToTransform.computeVertexNormals()

    return geometryToTransform
}

export async function createElevationGeometry(
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

    // Pre-allocate arrays with estimated sizes
    const estimatedVertexCount = width * height
    const vertices = new Float32Array(estimatedVertexCount * 3)
    const uvs = new Float32Array(estimatedVertexCount * 2)
    const indices: number[] = []

    // Keep track of actual vertex count and mapping
    let vertexCount = 0
    const validVertexIndices = new Int32Array(width * height).fill(-1)

    // Single pass to create vertices and faces simultaneously
    for (let row = 0; row < height - 1; row++) {
        for (let col = 0; col < width - 1; col++) {
            // Calculate indices for the quad corners
            const i0 = row * width + col
            const i1 = i0 + 1
            const i2 = i0 + width
            const i3 = i2 + 1

            // Process each vertex only if it hasn't been processed before
            const vertices_to_check = [
                { index: i0, col, row },
                { index: i1, col: col + 1, row },
                { index: i2, col, row: row + 1 },
                { index: i3, col: col + 1, row: row + 1 },
            ]

            // Process vertices
            for (const { index, col: vcol, row: vrow } of vertices_to_check) {
                if (validVertexIndices[index] === -1) {
                    const z = (data[index] as number) * scale
                    if (z >= -10000 && z <= 10000) {
                        const x = (vcol / (width - 1) - 0.5) * realWidth
                        const y = ((height - 1 - vrow) / (height - 1) - 0.5) *
                            realHeight

                        // Store vertex data
                        const vIndex = vertexCount * 3
                        vertices[vIndex] = x
                        vertices[vIndex + 1] = y
                        vertices[vIndex + 2] = z

                        // Store UV data
                        const uvIndex = vertexCount * 2
                        uvs[uvIndex] = vcol / (width - 1)
                        uvs[uvIndex + 1] = 1 - vrow / (height - 1)

                        validVertexIndices[index] = vertexCount
                        vertexCount++
                    }
                }
            }

            // Create faces if all vertices are valid
            const v0 = validVertexIndices[i0]
            const v1 = validVertexIndices[i1]
            const v2 = validVertexIndices[i2]
            const v3 = validVertexIndices[i3]

            if (v0 !== -1 && v1 !== -1 && v2 !== -1) {
                indices.push(v0, v2, v1) // First triangle
            }
            if (v1 !== -1 && v2 !== -1 && v3 !== -1) {
                indices.push(v1, v2, v3) // Second triangle
            }
        }
    }

    // Create the final geometry with actual data
    const geometry = new THREE.BufferGeometry()

    // Trim arrays to actual size
    const finalVertices = new Float32Array(vertices.buffer, 0, vertexCount * 3)
    const finalUvs = new Float32Array(uvs.buffer, 0, vertexCount * 2)

    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(finalVertices, 3),
    )

    geometry.setAttribute("uv", new THREE.BufferAttribute(finalUvs, 2))

    const indexArray = vertexCount > 65535
        ? new Uint32Array(indices)
        : new Uint16Array(indices)

    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1))

    geometry.computeVertexNormals()
    return geometry
}

export function analyzeGeometryCenter(
    geometry: THREE.BufferGeometry,
): THREE.Vector3 {
    const positions = geometry.getAttribute("position")
    const center = new THREE.Vector3()
    // Calculate center
    for (let i = 0; i < positions.count; i++) {
        center.add(
            new THREE.Vector3(
                positions.getX(i),
                positions.getY(i),
                positions.getZ(i),
            ),
        )
    }
    center.divideScalar(positions.count)
    return center
}
export function alignMeshes(
    sourceTiff: GeoTIFFImage,
    targetTiff: GeoTIFFImage,
    meshToTransform: THREE.Mesh,
): void {
    // Get bounding boxes
    const [srcMinX, srcMinY, srcMaxX, srcMaxY] = sourceTiff.getBoundingBox()
    const [tgtMinX, tgtMinY, tgtMaxX, tgtMaxY] = targetTiff.getBoundingBox()
    // Calculate centers
    const srcCenterX = (srcMaxX + srcMinX) / 2
    const srcCenterY = (srcMaxY + srcMinY) / 2
    const tgtCenterX = (tgtMaxX + tgtMinX) / 2
    const tgtCenterY = (tgtMaxY + tgtMinY) / 2
    // Calculate offset from target to source
    const offsetX = tgtCenterX - srcCenterX
    const offsetY = tgtCenterY - srcCenterY
    // Create transformation matrix
    const matrix = new THREE.Matrix4().makeTranslation(offsetX, offsetY, 0)
    // Apply to mesh's matrix
    meshToTransform.matrix.copy(matrix)
    meshToTransform.matrixAutoUpdate = false
}
