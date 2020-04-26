<template>
  <div id="app">
    <div class="bg-navbar"></div>
    <div class="hide-navbar">{{appTitle}}</div>
    <router-view/>
  </div>
</template>
<script>
export default {
    data: () => {
        return {
            appTitle: "CRYPTOX"
        };
    }
};
</script>
<style lang="scss">
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

#nav {
  padding: 30px;

  a {
    font-weight: bold;
    color: #2c3e50;

    &.router-link-exact-active {
      color: #42b983;
    }
  }
}

.hide-navbar {
  -webkit-app-region: drag;
  display: block;
  height: 22px;
  font-size: 11px;
  letter-spacing: 2px;
  font-weight: 600;
  padding: .4em 0;
  color: #777777;
}

.bg-navbar {
  position: absolute;
  background: #0000000d;
  width: 100%;
  height: 36px;
  top:0;
  left:0;
}
</style>
