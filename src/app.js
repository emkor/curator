function reqJson(req, url, retries) {
    return new Promise(function (resolve, reject) {
        fetch(url, req).then(r => {
            if (r.ok) {
                r.json()
                    .then(v => resolve(v))
                    .catch(e => reject(e))
            } else if (r.status === 429) {
                let retryInSeconds = r.headers.get("Retry-After");
                let retryInMs = 1000 * (parseInt(retryInSeconds) + 0.05);
                sleep(retryInMs)
                    .then(_ => app.getJson(url))
                    .then(v => resolve(v))
                    .catch(e => reject(e));
            } else if (r.status === 401) {
                let message = "Oops! You have spent here so much time that we need you to re-login at Spotify!";
                if (window.confirm(message)) {
                    window.location.href = "../index.html";
                }
            } else if (r.status === 404 && retries > 0) {
                console.debug("Retrying due to " + r.status + ": " + r.statusText + "; retries left: " + retries - 1);
                return reqJson(req, url, retries - 1)
            } else {
                reject(r.status + ": " + r.statusText + " for " + req.method + " at " + url);
            }
        })
    });
}

function reqPages(req, resp, acc, onSuccess) {
    if (resp.next != null) {
        reqJson(req, resp.next, 1)
            .then(v => reqPages(req, v, acc.concat(v.items), onSuccess))
            .catch(e => console.error("Error on paged-item " + resp.next + " retrieval: " + e));
    } else {
        let result = acc.concat(resp.items);
        onSuccess(result);
    }
}


function loadPagedItems(req, url) {
    return new Promise(function (resolve) {
        reqJson(req, url, 1)
            .then(v => reqPages(req, v, v.items, resolve))
            .catch(e => reject(e));
    });
}

function mapIdToItem(items) {
    return new Promise(function (resolve, reject) {
        var map = new Map();
        try {
            for (var item of items) {
                map.set(item.id, item);
            }
            resolve(map);
        } catch (e) {
            reject(e)
        }
    })
}

function mapSpotTrackForView(spotifyTrack) {
    let viewTrack = {
        id: spotifyTrack.id,
        artistNamesAndUrls: spotifyTrack.artists.map(a => [a.name, a.external_urls.spotify]),
        title: spotifyTrack.name,
        titleUrl: spotifyTrack.external_urls.spotify,
        url: spotifyTrack.uri,
        albumImageUrl: spotifyTrack.album.images[spotifyTrack.album.images.length - 1].url,
        albumName: spotifyTrack.album.name,
        albumUrl: spotifyTrack.album.external_urls.spotify,
        previewUrl: spotifyTrack.preview_url,
        durationMs: spotifyTrack.duration_ms,
        popularity: spotifyTrack.popularity
    };
    viewTrack.sortValueArtistTitle = makeSortString(viewTrack.artistNamesAndUrls[0][0] + " " + viewTrack.title);
    viewTrack.sortValueArtistAlbum = makeSortString(viewTrack.artistNamesAndUrls[0][0] + " " + viewTrack.albumName + " " + viewTrack.title);
    return viewTrack
}

function makeSortString(text) {
    return text.toLowerCase()
        .replace(/the /g, '')
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
        .replace(/\s{2,}/g, " ");
}

function toRatio(number) {
    return (number / 100).toFixed(2);
}

function millisToMinutesAndSeconds(millis) {
    var minutes = Math.floor(millis / 60000);
    var seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
}

class UserAction {
    constructor(isAddition, playId, playName, trackId, trackName) {
        this.isAddition = isAddition;
        this.playId = playId;
        this.playName = playName;
        this.trackId = trackId;
        this.trackName = trackName;
    }
}


var app = new Vue({
    el: '#curatorApp',
    data: {
        config: appConfig,
        token: null,
        userName: null,
        userUrl: null,
        userImgUrl: null,
        idToPlayList: new Map(),
        idToTrack: new Map(),
        playIdToTrackId: new Map(),
        trackIdToPlayId: new Map(),
        currPlayListId: null,
        currPlayListName: null,
        currentTrackId: null,
        playListsView: [],
        currPlayListTracks: [],
        tableSorter: null,
        userActions: []
    },
    computed: {
        isLoggedIn: function () {
            return this.token != null;
        },
        arePlayListsReady: function () {
            return this.playListsView.length > 0;
        },
        isPlayListSelected: function () {
            return this.currPlayListTracks.length > 0;
        }
    },
    methods: {
        start: function (currUrl) {
            app.token = new URL(currUrl.replace("#", "?")).searchParams.get('access_token');
            if (app.isLoggedIn) {
                app.getUserInfo()
                    .then(_ => app.loadPlayLists())
                    .then(_ => app.loadTracks())
                    .catch(e => console.error(e));
            }
        },
        spotifyLogin: function () {
            window.location.href = app.config.authUrl
                + "?client_id=" + encodeURIComponent(app.config.clientId)
                + "&redirect_uri=" + encodeURIComponent(app.config.callbackUrl)
                + "&scope=" + encodeURIComponent(app.config.scopes.join(" "))
                + "&show_dialog=true&response_type=token";
        },
        getUserInfo: function () {
            return app.getJson(app.config.apiUrl + "/me")
                .then(r => {
                    app.userName = r.display_name;
                    app.userUrl = r.external_urls.spotify;
                    if (r.images !== undefined && r.images.length > 0) {
                        app.userImgUrl = r.images[0].url;
                    }
                })
        },
        loadPlayLists: function () {
            return loadPagedItems(app.genApiReq("GET"), app.config.apiUrl + "/me/playlists?limit=50")
                .then(playLists => mapIdToItem(playLists))
                .then(idToPlayList => app.idToPlayList = idToPlayList)
                .then(_ => app.playListsView = Array.from(app.idToPlayList.values()));
        },
        loadTracks: function () {
            let promises = [];
            for (var playlistId of app.idToPlayList.keys()) {
                promises.push(app.getPlayListTracks(playlistId));
            }
            return Promise
                .all(promises)
                .then(playListTrackPromises => {
                    for (var promise of playListTrackPromises) {
                        for (var playListIdAndTracks of promise) {
                            let playId = playListIdAndTracks[0];
                            let playTrackIds = new Set(playListIdAndTracks[1].map(pl => pl.track.id));
                            for (var playListTrack of playListIdAndTracks[1]) {
                                app.idToTrack.set(playListTrack.track.id, playListTrack.track);
                                if (app.playIdToTrackId.has(playId)) {
                                    for (let trackId of playTrackIds) {
                                        app.playIdToTrackId.get(playId).add(trackId);
                                    }
                                } else {
                                    app.playIdToTrackId.set(playId, playTrackIds);
                                }
                                if (app.trackIdToPlayId.has(playListTrack.track.id)) {
                                    app.trackIdToPlayId.get(playListTrack.track.id).add(playId);
                                } else {
                                    app.trackIdToPlayId.set(playListTrack.track.id, new Set().add(playId));
                                }
                            }
                        }
                    }
                });
        },
        getPlayListTracks: function (playListId) {
            return new Promise(function (resolve, reject) {
                let playlistUrl = app.config.apiUrl + "/playlists/" + encodeURIComponent(playListId) + "/tracks?limit=100";
                loadPagedItems(app.genApiReq("GET"), playlistUrl)
                    .then(playlistTracks => resolve(new Map().set(playListId, playlistTracks)))
                    .catch(e => reject("Error on retrieving playlist " + playListId + " tracks: " + e));
            });
        },
        getPlaysWithTrack: function (trackId) {
            let playIdsTrackIsIn = Array.from(app.trackIdToPlayId.get(trackId));
            return app.playsFromIds(playIdsTrackIsIn);
        },
        getPlaysWithoutTrack: function (trackId) {
            let playIdsWithTrack = app.trackIdToPlayId.get(trackId);
            let playIdsWithoutTrack = Array.from(app.idToPlayList.keys()).filter(pId => !playIdsWithTrack.has(pId));
            return app.playsFromIds(playIdsWithoutTrack);
        },
        selectPlayList: function (event) {
            let playlistId = event.currentTarget.name.replace("selectPlayList-", "");
            let clickedLink = $(event.currentTarget);
            $(clickedLink).addClass("active");
            for (var btnSibling of clickedLink.siblings()) {
                $(btnSibling).removeClass("active");
            }
            app.currPlayListId = playlistId;
            app.currPlayListName = app.idToPlayList.get(playlistId).name;
            app.refreshPlayView();
        },
        addTrackToPlay: function (event) {
            let trackIdAndPlayId = event.currentTarget.name.replace("add-", "").replace("to-", "").split("-");
            let trackId = trackIdAndPlayId[0];
            let playId = trackIdAndPlayId[1];
            let addTrackUrl = app.config.apiUrl +
                "/playlists/" + encodeURIComponent(playId) +
                "/tracks?uris=" + encodeURIComponent("spotify:track:" + trackId);
            return app.postJson(addTrackUrl)
                .then(_ => {
                    app.playIdToTrackId.get(playId).add(trackId);
                    app.trackIdToPlayId.get(trackId).add(playId);
                    app.addAction(new UserAction(true, playId, app.idToPlayList.get(playId).name, trackId, app.idToTrack.get(trackId).name));
                    app.refreshPlayView();
                });
        },
        removeTrackFromPlay: function (event) {
            let trackIdAndPlaylistId = event.currentTarget.name.replace("remove-", "").replace("from-", "").split("-");
            let trackId = trackIdAndPlaylistId[0];
            let playId = trackIdAndPlaylistId[1];
            let rmUrl = app.config.apiUrl + "/playlists/" + encodeURIComponent(playId) + "/tracks";
            let rmBody = {tracks: [{uri: "spotify:track:" + trackId}]};
            app.deleteJson(rmUrl, rmBody)
                .then(_ => {
                    app.playIdToTrackId.get(playId).delete(trackId);
                    app.trackIdToPlayId.get(trackId).delete(playId);
                    app.addAction(new UserAction(false, playId, app.idToPlayList.get(playId).name, trackId, app.idToTrack.get(trackId).name));
                    app.refreshPlayView();
                });
        },
        setCurrTrack: function (event) {
            let trackId = event.currentTarget.name.replace("setCurrTrack-", "");
            app.currentTrackId = trackId;
        },
        addAction: function (action) {
            if (app.userActions.length >= 10) {
                app.userActions.shift();
            }
            app.userActions.push(action)
        },
        refreshPlayView: function () {
            let trackIds = Array.from(app.playIdToTrackId.get(app.currPlayListId));
            app.currPlayListTracks = trackIds.map(i => mapSpotTrackForView(app.idToTrack.get(i)));
            if (app.tableSorter === null) {
                app.tableSorter = new Tablesort(document.getElementById("playlistTracks"));
            } else {
                app.tableSorter.refresh();
            }
        },
        getJson: function (url) {
            return reqJson(app.genApiReq("GET"), url, 1);
        },
        postJson: function (url) {
            return reqJson(app.genApiReq("POST"), url, 0);
        },
        deleteJson: function (url, body) {
            return reqJson(app.genApiReq("DELETE", body), url, 0);
        },
        genApiReq: function (method, body) {
            if (body !== undefined) {
                return {method: method, headers: {'Authorization': 'Bearer ' + app.token}, body: JSON.stringify(body)};
            }
            return {method: method, headers: {'Authorization': 'Bearer ' + app.token}};
        },
        playsFromIds: function (playIds) {
            return playIds
                .map(playlistId => app.idToPlayList.get(playlistId))
                .sort(function (a, b) {
                    return a.name.localeCompare(b.name)
                })
        }
    }
});

app.start(document.URL);