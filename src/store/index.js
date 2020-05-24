import Vue from "vue";
import Vuex from "vuex";
import { createPersistedState, createSharedMutations } from "vuex-electron";

Vue.use(Vuex);

export default new Vuex.Store({
    state: {
        files: null
    },
    mutations: {
        setFiles(state, files) {
			state.files = files;
        },
        deleteFiles(state) {
            state.files = null;
        }
    },
    actions: {
        setFiles: function ({ commit }, files) {
            commit("setFiles", files);
        },
        delFiles: function({ commit }) {
            commit("deleteFiles");
        }
    },
    getters: {
		files: state => state.files
    },
    plugins: [
        createPersistedState(),
        createSharedMutations()
    ],
});
