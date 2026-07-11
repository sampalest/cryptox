<template>
    <div class="lk-toasts">
        <transition-group name="lk-toast">
            <div
                v-for="toast in toasts.toasts"
                :key="toast.id"
                class="lk-toast"
                :class="`lk-toast-${toast.kind}`"
                role="alert"
                @click="toasts.dismiss(toast.id)"
            >
                <lk-icon :name="icons[toast.kind]" :size="16" />
                <span class="lk-toast-text">{{ toast.message }}</span>
            </div>
        </transition-group>
    </div>
</template>
<script>
import LkIcon from "@/components/ui/LkIcon.vue";
import { useToastStore } from "@/store/toasts";

export default {
    name: "toast-stack",
    components: {
        "lk-icon": LkIcon
    },
    setup() {
        return { toasts: useToastStore() };
    },
    computed: {
        icons() {
            return { error: "alert-circle", warning: "alert-triangle", info: "info" };
        }
    }
};
</script>
