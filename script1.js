import * as THREE from 'three';
import { flagColours } from '../../public/county_info';

class WavingFlag {
    constructor(county) {
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext('2d');

        // Get the colours for the county
        const colours = flagColours[county];
        const bandWidth = canvas.width / colours.length;

        // Paint the canvas with the colours
        colours.forEach((colour, index) => {
            context.fillStyle = colour;
            context.fillRect(index * bandWidth, 0, bandWidth, canvas.height);
        });

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);

        

        // create object
        const flagGeometry = new THREE.PlaneGeometry(20, 12.5, 12, 12);
        
        const flagMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            side: THREE.DoubleSide,
            roughness: 0.7,
            metalness: 0.1,
        });

        this.flag = new THREE.Mesh(flagGeometry, flagMaterial);
        // Move the flag back to -100 so we can see it
        this.flag.position.z = -50;
        this.originalPositions = this.flag.geometry.attributes.position.array.slice();

        const box = new THREE.Box3().setFromObject(this.flag);
        console.log(box);

        // for animation
        this.coeff = 72;
        this.coeff2 = 65;
        this.gap = 10;
        this.thespeed = 30;
        this.spacing = 30;
    }

    // Update function
    update() {
        console.log('update');
        this.time = performance.now() * 0.001 * (this.thespeed / 10);
        const positions = this.flag.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            const x = this.originalPositions[i];
            const y = this.originalPositions[i + 1];
            positions[i + 2] = 1 + 
                (this.spacing / 25) * 
                noise.perlin2(
                    x * (this.gap / this.coeff) + this.time,
                    y * (this.gap / this.coeff2)
                );
        }
        this.flag.geometry.attributes.position.needsUpdate = true;//must be set or vertices will not update
        this.flag.geometry.computeVertexNormals();
    }
}

export default WavingFlag;