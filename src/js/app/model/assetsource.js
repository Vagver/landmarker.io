'use strict';

var Backbone = require('backbone');
var _ = require('underscore');
var Asset = require('./asset');

function abortAllObj (obj) {
    _.values(obj).forEach(function (x) {
        x.abort();
    });
}

// Holds a list of available assets.
var AssetSource = Backbone.Model.extend({

    defaults: function () {
        return { assets: new Backbone.Collection(), assetIsLoading: false };
    },

    fetch: function () {
        return (
            this.get('server').fetchCollection(this.id).then((response) => {
                this.set('assets', this.parse(response).assets);
            })
        );
    },

    asset: function () {
        return this.get('asset');
    },

    assets: function () {
        return this.get('assets');
    },

    mesh: function () {
        return this.get('asset').mesh();
    },

    assetIsLoading: function () {
        return this.get('assetIsLoading');
    },

    nAssets: function () {
        return this.get('assets').length;
    },

    hasPredecessor: function () {
        return this.assetIndex() !== 0;
    },

    hasSuccessor: function () {
        return this.nAssets() - this.assetIndex() !== 1;
    },

    // returns the index of the currently active mesh
    assetIndex: function () {
        return this.assets().indexOf(this.get('asset'));
    },

    next: function () {
        if (!this.hasSuccessor()) {
            return undefined;
        }
        return this.setAsset(this.assets()[this.assetIndex() + 1]);
    },

    previous: function () {
        if (!this.hasPredecessor()) {
            return undefined;
        }
        return this.setAsset(this.assets()[this.assetIndex() - 1]);
    },

    setIndex: function (newIndex) {
        if (newIndex < 0 || newIndex >= this.nAssets()) {
            console.log(`Can't go to asset with index ${newIndex + 1}`);
            return null;
        } else {
            return this.setAsset(this.assets()[newIndex]);
        }
    },

    updateMesh: function () {
        this.trigger('change:mesh');
    }
});

exports.MeshSource = AssetSource.extend({

    parse: function (response) {
        var meshes = response.map((assetId) => {
            return new Asset.Mesh({
                id: assetId,
                server: this.get('server')
            });
        });

        return { assets: meshes };
    },

    setAsset: function (newMesh) {
        var that = this;
        var oldAsset = this.get('asset');
        // stop listening to the old asset
        if (oldAsset) {
            this.stopListening(oldAsset);
        }
        if (!this.hasOwnProperty('pending')) {
            this.pending = {};
        }
        // kill any current fetches
        abortAllObj(this.pending);
        this.set('assetIsLoading', true);
        // set the asset immediately (triggering change in UI)
        that.set('asset', newMesh);

        this.listenTo(newMesh, 'newMeshAvailable', this.updateMesh);

        // update the mesh immediately (so we get a placeholder if nothing else)
        this.updateMesh();

        // fetch the thumbnail and texture aggressively asynchronously.
        // TODO should track the thumbnail here too
        newMesh.loadThumbnail();
        newMesh.loadTexture();
        // fetch the geometry
        var geometry = newMesh.loadGeometry();

        // track the request
        this.pending[newMesh.id] = geometry.xhr();

        // after the geometry is ready, we want to clear up our tracking of
        // loading requests.
        geometry.then(function () {
            console.log('grabbed new mesh geometry');
            // now everyone has moved onto the new mesh, clean up the old
            // one.
            if (oldAsset) {
                //oldAsset.dispose();
                oldAsset = null;
            }
            delete that.pending[newMesh.id];
            that.set('assetIsLoading', false);
        }, function (err) {
            console.log('geometry.then something went wrong ' + err.stack);
        });
        // return the geometry promise
        return geometry;
    }
});

// Holds a list of available images, and a ImageList. The ImageList
// is populated immediately, although images aren't fetched until demanded.
// Also has a mesh parameter - the currently active mesh.
exports.ImageSource = AssetSource.extend({

    parse: function (response) {
        var images = response.map((assetId) => {
            return new Asset.Image({
                id: assetId,
                server: this.get('server')
            });
        });

        return { assets: images };
    },

    setAsset: function (newAsset) {
        var that = this;
        var oldAsset = this.get('asset');
        // stop listening to the old asset
        if (oldAsset) {
            this.stopListening(oldAsset);
        }
        this.set('assetIsLoading', true);
        // set the asset immediately (triggering change in UI)
        that.set('asset', newAsset);

        this.listenTo(newAsset, 'newMeshAvailable', this.updateMesh);

        // update the mesh immediately (so we get a placeholder if nothing else)
        this.updateMesh();

        // fetch the thumbnail and texture aggressively asynchronously.
        newAsset.loadThumbnail();
        var texture = newAsset.loadTexture();

        // after the texture is ready, we want to clear up our tracking of
        // loading requests.
        texture.then(function () {
            console.log('grabbed new image texture');
            that.set('assetIsLoading', false);
        }, function (err) {
            console.log('texture.then something went wrong ' + err.stack);
        });
        // return the texture promise. Once the texture is ready, landmarks
        // can be displayed.
        return texture;
    }
});
