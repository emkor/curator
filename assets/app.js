var app = new Vue({
    el: '#curatorApp',
    data: {
        config: appConfig,
        token: null,
        userName: null,
        userUrl: null,
        userImgUrl: null
    },
    computed: {
        isLoggedIn: function () {
            return this.token != null;
        }
    },
    methods: {
        start: function (currUrl) {
            this.token = new URL(currUrl.replace("#", "?")).searchParams.get('access_token');
            if (this.isLoggedIn) {
                app.getJson(this.config.apiUrl + "/me")
                    .then(r => {
                        this.userName = r.display_name;
                        this.userUrl = r.external_urls.spotify;
                        if (r.images !== undefined && r.images.length > 0) {
                            this.userImgUrl = r.images[0].url;
                        }
                    })
                    .catch(e => console.error(e));
            }
        },
        spotifyLogin: function () {
            let fullAuthUrl = app.config.authUrl
                + "?client_id=" + encodeURIComponent(app.config.clientId)
                + "&redirect_uri=" + encodeURIComponent(app.config.callbackUrl)
                + "&scope=" + encodeURIComponent(app.config.scopes.join(" "))
                + "&show_dialog=true&response_type=token";
            window.location.href = fullAuthUrl;
        },
        getJson(url) {
            let request = {method: "GET", headers: {'Authorization': 'Bearer ' + this.token}};
            return new Promise(function (resolve, reject) {
                fetch(url, request).then(r => {
                    if (r.ok) {
                        r.json().then(v => resolve(v)).catch(e => reject(e))
                    } else if (r.status === 429) {
                        let retryInSeconds = r.headers.get("Retry-After");
                        sleep(1000 * parseInt(retryInSeconds) + 1)
                            .then(_ => this.getJson(url))
                            .then(v => resolve(v))
                            .catch(e => reject(e));
                    } else if (r.status === 401) {
                        let message = "Oops! You have spent here so much time that Spotify need you to re-login";
                        if (window.confirm(message)) {
                            window.location.href = "../index.html";
                        }
                    } else {
                        reject(r.status + ": " + r.statusText + " for " + url);
                    }
                })
            })
        }
    }
});

app.start(document.URL);