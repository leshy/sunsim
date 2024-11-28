import * as THREE from "npm:three"
import { ConvexGeometry } from "npm:three/addons/geometries/ConvexGeometry.js"

export function removeOverlappingVertices(
    lowResGeometry: THREE.BufferGeometry,
    highResGeometry: THREE.BufferGeometry,
    threshold = 0.1,
): THREE.BufferGeometry {
    const hull = new ConvexGeometry(
        Array.from(
            { length: highResGeometry.attributes.position.count },
            (_, i) =>
                new THREE.Vector3().fromBufferAttribute(
                    highResGeometry.attributes.position,
                    i,
                ),
        ),
    )
    hull.scale(1 + threshold, 1 + threshold, 1 + threshold)
    const hullMesh = new THREE.Mesh(hull)

    const oldPositions = lowResGeometry.attributes.position
    const indices = lowResGeometry.index
        ? Array.from(lowResGeometry.index.array)
        : null
    const keptVertices = new Set<number>()

    // Find vertices to keep
    for (let i = 0; i < oldPositions.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(oldPositions, i)
        if (!isPointInMesh(vertex, hullMesh)) {
            keptVertices.add(i)
        }
    }

    // Create vertex mapping
    const oldToNew = new Map<number, number>()
    let newIndex = 0
    Array.from(keptVertices).forEach((i) => {
        oldToNew.set(i, newIndex++)
    })

    // Create new geometry with preserved attributes
    const newGeometry = new THREE.BufferGeometry()

    // Copy all attributes
    Object.entries(lowResGeometry.attributes).forEach(([name, attribute]) => {
        const itemSize = attribute.itemSize
        const newArray = new Float32Array(keptVertices.size * itemSize)

        Array.from(keptVertices).forEach((oldIdx, newIdx) => {
            for (let i = 0; i < itemSize; i++) {
                newArray[newIdx * itemSize + i] =
                    attribute.array[oldIdx * itemSize + i]
            }
        })

        newGeometry.setAttribute(
            name,
            new THREE.BufferAttribute(newArray, itemSize),
        )
    })

    // Update indices if they exist
    if (indices) {
        const newIndices: number[] = []
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i]
            const b = indices[i + 1]
            const c = indices[i + 2]

            if (
                keptVertices.has(a) &&
                keptVertices.has(b) &&
                keptVertices.has(c)
            ) {
                newIndices.push(
                    oldToNew.get(a)!,
                    oldToNew.get(b)!,
                    oldToNew.get(c)!,
                )
            }
        }
        newGeometry.setIndex(newIndices)
    }

    return newGeometry
}

function isPointInMesh(
    point: THREE.Vector3,
    mesh: THREE.Mesh,
    minDistance = 1000,
): boolean {
    const directions = [
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1),
    ]

    const raycaster = new THREE.Raycaster()

    for (const direction of directions) {
        raycaster.set(point, direction)
        const intersects = raycaster.intersectObject(mesh)

        if (intersects.length % 2 === 1) {
            return true
            // Point is inside, check distance to nearest intersection
            const distance = intersects.reduce(
                (min, int) => Math.min(min, int.distance),
                Infinity,
            )

            return distance < minDistance
        }
    }
    return false
}
