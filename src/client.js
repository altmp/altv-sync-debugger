
import alt from 'alt-client';

class SyncDebugger {
    constructor() {
        this.rml = new alt.RmlDocument('/src/index.rml');
        this.root = this.rml.querySelector('#root > .wrapper');
        this.timer = alt.setInterval(this.updateTick, 10);
        this.state = false;

        alt.on('worldObjectStreamIn', this.streamIn);
        alt.on('worldObjectStreamOut', this.streamOut);
        alt.on('gameEntityCreate', this.streamIn);
        alt.on('gameEntityDestroy', this.streamIn);
        alt.on('keydown', this.keydown);
    }

    destroy() {
        alt.off('worldObjectStreamIn', this.streamIn);
        alt.off('worldObjectStreamOut', this.streamOut);
        alt.off('gameEntityCreate', this.streamIn);
        alt.off('gameEntityDestroy', this.streamIn);
        alt.off('keydown', this.keydown);

        alt.clearTimer(this.timer);
        this.rml.destroy();
    }

    updateTick = () => {
        for (const player of alt.Player.all) {
            this.updateData(player);
        }
        for (const vehicle of alt.Vehicle.all) {
            if (!vehicle.isRemote) continue;
            this.updateData(vehicle);
        }
        for (const ped of alt.Ped.all) {
            if (!ped.isRemote) continue;
            this.updateData(ped);
        }
        for (const object of alt.Object.all) {
            if (!object.isRemote) continue;
            this.updateData(object);
        }
    }

    streamIn = (entity) => {
        this.addEntity(entity);
    }

    streamOut = (entity) => {
        this.removeEntity(entity);
    }

    keydown = (key) => {
        if (key != 121) return; // F10
        this.state = !this.state;
        alt.toggleRmlControls(this.state);
        alt.showCursor(this.state);
        alt.toggleGameControls(!this.state);
    }

    static #sanitize(value) {
        return value.replace(/[\<\>\{]/g, '');
    }

    /** @param {alt.Entity} entity */
    static #getTemplate(entity, name) {
        let components = '';

        let absId = 0;
        for (const [componentIndex, component] of Object.entries(entity.getSyncInfo().propertyUpdateTicks)) {
            let properties = '';
            
            for (const [propertyIndex, property] of Object.entries(component)) {
                properties += `
                <div class="property" id="${entity.remoteID}-${componentIndex}-${propertyIndex}">
                    <div class="name">${propertyIndex} (${absId++})</div>
                    <div class="value">${property}</div>
                </div>`;
            }

            components += `
            <div class="group component" id="${entity.remoteID}-${componentIndex}">
                <div class="name"><span>Component ${componentIndex}</span><span class="caret">v</span></div>
                <div class="content">
                    <div class="syncProperties">
                    ${properties}
                    </div>
                </div>
            </div>`;
        }
        
        return `
        <div class="name" id="${entity.remoteID}-name"><span>${this.#sanitize(name)} (${entity.remoteID})</span><span class="caret">v</span></div>
        <div class="content">
        <div class="info" id="${entity.remoteID}-info">
        </div>
        ${components}
        </div>`;
    }

    /** @param {alt.Entity} entity */
    updateData(entity) {
        let element = entity.syncElement;
        if (!element) element = this.addEntity(entity);

        const syncInfo = entity.getSyncInfo();
        const owned = entity.netOwner == alt.Player.local || entity.netOwner == null;
        const acked = syncInfo.sendTick <= syncInfo.ackedSendTick;
        element.setAttribute('error', String(!acked));
        element.querySelector(`#${entity.remoteID}-info`).innerRML = `Pos: ${entity.pos.x.toFixed(2)} ${entity.pos.y.toFixed(2)} ${entity.pos.z.toFixed(2)}\n` +
            `Owned: ${owned ? 'YES' : 'NO'}\n` +
            `Send tick: ${syncInfo.sendTick} sent / ${syncInfo.ackedSendTick} acked ${!acked && owned ? `<span style="color: #FF7777">Not acked: ${syncInfo.sendTick - syncInfo.ackedSendTick} ticks</span>` : ''}\n` +
            `Receive tick: ${syncInfo.receivedTick} normal / ${syncInfo.fullyReceivedTick} fully`;

        for (const [componentIndex, component] of Object.entries(syncInfo.propertyUpdateTicks)) {
            const acked = !owned || component.every(e => e <= syncInfo.ackedSendTick);
            const componentElement = element.querySelector(`#${entity.remoteID}-${componentIndex}`);
            componentElement.setAttribute('error', String(!acked));

            for (const [propertyIndex, property] of Object.entries(component)) {
                const id = `#${entity.remoteID}-${componentIndex}-${propertyIndex}`;
                const propertyElement = element.querySelector(id);
                propertyElement.querySelector('.value').innerRML = String(property);
                const acked = property <= syncInfo.ackedSendTick || !owned;
                propertyElement.setAttribute('error', String(!acked));
            }
        }
    }

    /** @param {alt.Entity} entity */
    addEntity(entity) {
        let name = entity.constructor.name + ' ' ;

        if (entity instanceof alt.Player) name += entity.name;
        else if (entity instanceof alt.Ped || entity instanceof alt.Vehicle || entity instanceof alt.Object) name += entity.model;
        else return;

        const entityGroup = this.rml.createElement('div');
        entityGroup.addClass('group');
        entityGroup.addClass('entity');
        entityGroup.addClass('open');
        entityGroup.innerRML = SyncDebugger.#getTemplate(entity, name);

        const entityName = entityGroup.querySelector(`#${entity.remoteID}-name`);
        entityName.on('click', () => {
            if (entityGroup.hasClass('open')) entityGroup.removeClass('open');
            else entityGroup.addClass('open');
        });

        
        for (const [componentIndex, component] of Object.entries(entity.getSyncInfo().propertyUpdateTicks)) {
            const componentGroup = entityGroup.querySelector(`#${entity.remoteID}-${componentIndex}`);
            componentGroup.querySelector('.name').on('click', () => {
                if (componentGroup.hasClass('open')) componentGroup.removeClass('open');
                else componentGroup.addClass('open');
            });
        }

        entity.syncElement = entityGroup;
        this.root.appendChild(entityGroup);

        return entityGroup;
    }
    
    /** @param {alt.Entity} entity */
    removeEntity(entity) {
        const entityGroup = entity.syncElement;
        if (!entityGroup) return;
        this.root.removeChild(entityGroup);
    }
};

let instance = null;

function toggle() {
    if (instance) {
        instance.destroy();
        instance = null;
    } else {
        instance = new SyncDebugger();
    }
}

alt.on('consoleCommand', (cmd) => {
    if (cmd === 'syncdebug')
        toggle();
});