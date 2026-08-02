import {type ClientConfig, createLogger, DEFAULT_LOG_LEVEL, fetchClientConfig, type Logger,} from "../core";
import {AdminApiClient} from "./api";
import {AuthService} from "./auth";
import {CommandService} from "./commands";
import {AdminDom} from "./dom";
import {I18n} from "./i18n";
import {AdminStorage} from "./storage";
import type {TokenData} from "./types";
import {UIManager} from "./ui";
import {AdminLogSocket} from "./websocket";

export interface AdminAppOptions {
    storage?: AdminStorage;
    dom?: AdminDom;
}

/**
 * Admin panel application root.
 *
 * Constructs the whole object graph and wires it together. Nothing below this
 * class imports a shared instance, which keeps every service independently
 * constructible (and testable). The graph is built in {@link init} because the
 * logger's level comes from the server config.
 */
export class AdminApp {
    private readonly storage: AdminStorage;
    private readonly dom: AdminDom;

    private logger!: Logger;
    private api!: AdminApiClient;
    private i18n!: I18n;
    private ui!: UIManager;
    private socket!: AdminLogSocket;
    private commands!: CommandService;
    private auth!: AuthService;

    private tokenData: TokenData | null = null;

    constructor(options: AdminAppOptions = {}) {
        this.storage = options.storage ?? new AdminStorage();
        this.dom = options.dom ?? new AdminDom();
    }

    async init(): Promise<void> {
        // Config first: it carries the log level, so nothing that logs can be
        // constructed before it resolves.
        const config = await fetchClientConfig().catch(() => null);

        this.build(config);

        if (config) {
            this.logger.trace({loadedConfig: config}, "loaded client config");
        } else {
            this.logger.warn(
                {level: DEFAULT_LOG_LEVEL},
                "failed to load client config, using default log level",
            );
        }

        await this.i18n.init();

        // Non-blocking: warms the salt cache for the first login.
        void this.auth.prefetchSalt();

        this.logger.trace("setting default handlers");
        this.ui.setupAutoScroll();
        this.ui.setupLanguageSelector();

        this.auth.setupAuthHandler(this.handleLogin);
        this.auth.setupDisconnectHandler(this.handleLogout);
        this.commands.setupCommandHandler();
        this.commands.setupQuickCommands();
        this.commands.setupGameSettingsHandler();
        this.commands.setupChangelevelHandler();

        this.restoreSession();

        this.logger.info("admin panel ready");
    }

    /** Builds the object graph, handing each service its own scoped logger. */
    private build(config: ClientConfig | null): void {
        this.logger = createLogger({
            level: config?.log_level ?? DEFAULT_LOG_LEVEL,
            bindings: {app: "admin"},
        });

        this.api = new AdminApiClient({logger: this.logger.child({scope: "api"})});

        this.i18n = new I18n({
            storage: this.storage,
            logger: this.logger.child({scope: "i18n"}),
        });

        this.ui = new UIManager({dom: this.dom, i18n: this.i18n});

        this.socket = new AdminLogSocket({
            logger: this.logger.child({scope: "websocket"}),
            dom: this.dom,
            ui: this.ui,
            i18n: this.i18n,
        });

        this.commands = new CommandService({
            dom: this.dom,
            ui: this.ui,
            socket: this.socket,
            api: this.api,
            i18n: this.i18n,
            logger: this.logger.child({scope: "commands"}),
        });

        this.auth = new AuthService({
            dom: this.dom,
            logger: this.logger.child({scope: "auth"}),
            api: this.api,
            storage: this.storage,
            ui: this.ui,
            i18n: this.i18n,
        });
    }

    private restoreSession(): void {
        const storedTokenData = this.storage.loadTokenData();
        if (!storedTokenData) {
            this.logger.debug("no stored session found");
            return;
        }

        this.logger.info({username: storedTokenData.username}, "restoring session");
        this.auth.initializeAdminPanel(storedTokenData);
        this.startSession(storedTokenData);
    }

    private startSession(tokenData: TokenData): void {
        this.tokenData = tokenData;
        this.api.authToken = tokenData.token;
        this.commands.initialize(tokenData, this.handleLogout);
        this.socket.authenticate(tokenData, this.handleLogout);
    }

    private readonly handleLogin = (tokenData: TokenData): void => {
        this.logger.info({username: tokenData.username}, "logged in");
        this.startSession(tokenData);
    };

    private readonly handleLogout = (): void => {
        this.logger.info({username: this.tokenData?.username}, "logged out");
        this.socket.disconnect();
        this.ui.clearLogs();
        this.ui.showAuthPanel();
        this.api.authToken = null;
        this.tokenData = null;
    };
}
