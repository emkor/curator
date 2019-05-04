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
                    .then(_ => this.getJson(url))
                    .then(v => resolve(v))
                    .catch(e => reject(e));
            } else if (r.status === 401) {
                let message = "Oops! You have spent here so much time that we need you to re-login at Spotify!";
                if (window.confirm(message)) {
                    window.location.href = "../index.html";
                }
            } else if (r.status === 404 && retries > 0) {
                return reqJson(req, url, retries - 1)
            } else {
                reject(r.status + ": " + r.statusText + " for " + req.method + " at " + url);
            }
        })
    })
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


var app = new Vue({
    el: '#curatorApp',
    data: {
        config: appConfig,
        token: null,
        userName: null,
        userUrl: null,
        userImgUrl: null,
        idToPlayList: null,
        playListView: [],
        playListTracks: [],
        idToTrack: null,
        playIdToTrackId: null,
        currPlayListId: null,
        currPlayListName: null,
    },
    computed: {
        isLoggedIn: function () {
            return this.token != null;
        },
        arePlayListsReady: function () {
            return this.playListView.length > 0;
        },
        isPlayListSelected: function () {
            return this.playListTracks.length > 0;
        }
    },
    methods: {
        start: function (currUrl) {
            this.token = new URL(currUrl.replace("#", "?")).searchParams.get('access_token');
            if (this.isLoggedIn) {
                this.getUserInfo()
                    .then(_ => console.log("Done user"))
                    .then(_ => app.getPlayLists())
                    .then(_ => console.log("Done play lists"))
                    .then(_ => app.getTracks())
                    .then(_ => console.log("Done tracks"))
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
            return app.getJson(this.config.apiUrl + "/me")
                .then(r => {
                    this.userName = r.display_name;
                    this.userUrl = r.external_urls.spotify;
                    if (r.images !== undefined && r.images.length > 0) {
                        this.userImgUrl = r.images[0].url;
                    }
                })
        },
        getPlayLists: function () {
            return loadPagedItems(app.genApiReq("GET"), this.config.apiUrl + "/me/playlists?limit=50")
                .then(playLists => mapIdToItem(playLists))
                .then(idToPlayList => app.idToPlaylist = idToPlayList)
                .then(_ => app.playListView = Array.from(app.idToPlaylist.values()));
        },
        getTracks: function () {
            let promises = [];
            for (var playlistId of app.idToPlaylist.keys()) {
                promises.push(app.getPlayListTracks(playlistId));
            }
            app.playIdToTrackId = new Map();
            app.idToTrack = new Map();
            return Promise
                .all(promises)
                .then(playListTrackPromises => {
                    for (var promise of playListTrackPromises) {
                        for (var playListIdAndTracks of promise) {
                            let playId = playListIdAndTracks[0];
                            for (var playListTrack of playListIdAndTracks[1]) {
                                app.idToTrack.set(playListTrack.track.id, playListTrack.track);
                            }
                            app.playIdToTrackId.set(playId, new Set(playListIdAndTracks[1].map(pl => pl.track.id)));
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
        selectPlayList: function (event) {
            let playlistId = event.currentTarget.name.replace("selectPlayList-", "");
            let clickedLink = $(event.currentTarget);
            $(clickedLink).addClass("active");
            for (var btnSibling of clickedLink.siblings()) {
                $(btnSibling).removeClass("active");
            }
            app.currPlayListId = playlistId;
            app.currPlayListName = app.idToPlaylist.get(playlistId).name;
            let trackIdsArray = Array.from(app.playIdToTrackId.get(app.currPlayListId));
            app.playListTracks = trackIdsArray.map(i => app.idToTrack.get(i));

        },
        getJson: function (url) {
            return reqJson(app.genApiReq("GET"), url, 1);
        },
        genApiReq: function (method, body) {
            if (method === "GET" || method === "DELETE") {
                return {method: method, headers: {'Authorization': 'Bearer ' + this.token}};
            } else if ((method === "POST" || method === "PUT") && (body !== undefined && body !== null)) {
                return {method: method, headers: {'Authorization': 'Bearer ' + this.token}, body: body};
            } else {
                throw Error("Can not send request method " + method + " with body: " + body);
            }
        }
    }
});

app.start(document.URL);