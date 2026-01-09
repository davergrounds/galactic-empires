const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let gameState = null;

async function fetchState() {
    try {
        const res = await fetch('/state');
        if (!res.ok) throw new Error('Cannot fetch state');
        gameState = await res.json();
        document.getElementById('info').innerText = 'Turn: ' + gameState.turn;
        draw();
    } catch (err) {
        console.error(err);
    }
}

function draw() {
    if (!gameState) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const mapScale = 150; // Increase scale to see systems clearly
    const offsetX = canvas.width / 2 - mapScale * 2.5; // Center map
    const offsetY = canvas.height / 2 - mapScale * 2.5;

    // Draw systems
    gameState.systems.forEach(sys => {
        const x = sys.x * mapScale + offsetX;
        const y = sys.y * mapScale + offsetY;
        ctx.beginPath();
        ctx.arc(x, y, 25, 0, Math.PI * 2);
        ctx.fillStyle = sys.owner === 'ithaxi' ? 'orange' : sys.owner === 'hive' ? 'green' : 'gray';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.stroke();
        ctx.fillStyle = 'white';
        ctx.font = '14px sans-serif';
        ctx.fillText(sys.id, x - 20, y - 35);
        ctx.fillText('Res: ' + sys.resources, x - 20, y + 40);
    });

    // Draw units
    gameState.units.forEach(u => {
        if (!u.systemId) return;
        const sys = gameState.systems.find(s => s.id === u.systemId);
        if (!sys) return;
        const x = sys.x * mapScale + offsetX + Math.random()*10-5; // jitter for clarity
        const y = sys.y * mapScale + offsetY + Math.random()*10-5;

        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fillStyle = u.faction === 'ithaxi' ? 'orange' : 'green';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.font = '12px sans-serif';
        ctx.fillText(u.type + ' (' + u.hitsRemaining + ')', x - 20, y - 18);

        if (u.type === 'JumpShip' && u.cargo && u.cargo.length > 0) {
            ctx.fillText('Cargo: ' + u.cargo.length, x - 20, y + 20);
        }
    });
}

// Fetch every 2 seconds
fetchState();
setInterval(fetchState, 2000);
