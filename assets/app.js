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
    }
});