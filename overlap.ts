import * as THREE from "npm:three"
import { ConvexGeometry } from "npm:three/addons/geometries/ConvexGeometry.js"

export function cutHole(
    lowResGeometry: THREE.BufferGeometry,
    highResMesh: THREE.Mesh,
): THREE.BufferGeometry {
    // Get the original arrays
    const positions = Array.from(lowResGeometry.attributes.position.array)
    const indices = Array.from(lowResGeometry.index?.array || [])

    // Track which vertices should be removed
    const verticesToRemove = new Set<number>()

    // Create raycaster
    const raycaster = new THREE.Raycaster()
    const upVector = new THREE.Vector3(0, 1, 0)

    // Check each vertex
    for (let i = 0; i < positions.length; i += 3) {
        const vertexPosition = new THREE.Vector3(
            positions[i],
            positions[i + 1],
            positions[i + 2],
        )

        // Offset slightly below to ensure we catch intersections
        vertexPosition.y -= 0.1 // Adjust this offset based on your scale

        raycaster.set(vertexPosition, upVector)
        const intersects = raycaster.intersectObject(highResMesh)

        if (intersects.length > 0) {
            verticesToRemove.add(i / 3) // Store vertex index
        }
    }

    // Create mapping for new vertex indices
    const indexMap = new Map<number, number>()
    let newIndex = 0

    for (let i = 0; i < positions.length / 3; i++) {
        if (!verticesToRemove.has(i)) {
            indexMap.set(i, newIndex++)
        }
    }

    // Create new position array without removed vertices
    const newPositions: number[] = []
    for (let i = 0; i < positions.length; i += 3) {
        if (!verticesToRemove.has(i / 3)) {
            newPositions.push(positions[i], positions[i + 1], positions[i + 2])
        }
    }

    // Create new index array, skipping faces that use removed vertices
    const newIndices: number[] = []
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i]
        const b = indices[i + 1]
        const c = indices[i + 2]

        // Only keep faces where none of the vertices were removed
        if (
            !verticesToRemove.has(a) &&
            !verticesToRemove.has(b) &&
            !verticesToRemove.has(c)
        ) {
            // Map to new indices
            newIndices.push(
                indexMap.get(a)!,
                indexMap.get(b)!,
                indexMap.get(c)!,
            )
        }
    }

    // Create new geometry
    const newGeometry = new THREE.BufferGeometry()
    newGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(newPositions, 3),
    )
    newGeometry.setIndex(newIndices)

    // Copy other attributes if they exist
    for (const key in lowResGeometry.attributes) {
        if (key !== "position") {
            const attribute = lowResGeometry.attributes[key]
            const itemSize = attribute.itemSize
            const newArray: number[] = []

            for (let i = 0; i < positions.length / 3; i++) {
                if (!verticesToRemove.has(i)) {
                    for (let j = 0; j < itemSize; j++) {
                        newArray.push(attribute.array[i * itemSize + j])
                    }
                }
            }

            newGeometry.setAttribute(
                key,
                new THREE.Float32BufferAttribute(newArray, itemSize),
            )
        }
    }

    // Recompute normals if they exist
    if (newGeometry.attributes.normal) {
        newGeometry.computeVertexNormals()
    }

    return newGeometry
}
