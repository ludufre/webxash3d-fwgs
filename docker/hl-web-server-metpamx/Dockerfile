FROM yohimik/cs-web-server-metpamx:latest AS base

USER root

RUN cp -r /xashds/cstrike/addons /xashds/valve/

WORKDIR /xashds/valve

# Remove CS-specific configs added at the end (lines after amx_mldebug "")
RUN sed -i '/^amx_mldebug ""/,${ /^amx_mldebug ""/!d }' \
    addons/amxmodx/configs/amxx.cfg

# Revert cmds.ini - remove the two added lines
RUN sed -i '/" ".*"-".*"".*"u"/d' \
    addons/amxmodx/configs/cmds.ini && \
    sed -i '/"Restart Round".*"sv_restartround 1"/d' \
    addons/amxmodx/configs/cmds.ini

# Revert core.ini - remove csstats entries
RUN sed -i '/; It is important that "csstats" comes before "csstats_score"/d' \
    addons/amxmodx/configs/core.ini && \
    sed -i '/^csstats[[:space:]]/d' \
    addons/amxmodx/configs/core.ini && \
    sed -i '/^csstats_score[[:space:]]/d' \
    addons/amxmodx/configs/core.ini

# Revert cvars.ini - remove CS-specific cvars
RUN sed -i '/"mp_friendlyfire"/d' addons/amxmodx/configs/cvars.ini && \
    sed -i '/"mp_limitteams"/d' addons/amxmodx/configs/cvars.ini && \
    sed -i '/"mp_autoteambalance"/d' addons/amxmodx/configs/cvars.ini && \
    sed -i '/"allow_spectators"/d' addons/amxmodx/configs/cvars.ini && \
    sed -i '/"mp_freezetime"/d' addons/amxmodx/configs/cvars.ini && \
    sed -i '/"mp_buytime"/d' addons/amxmodx/configs/cvars.ini && \
    sed -i '/"mp_startmoney"/d' addons/amxmodx/configs/cvars.ini && \
    sed -i '/"mp_c4timer"/d' addons/amxmodx/configs/cvars.ini && \
    sed -i '/"mp_forcechasecam"/d' addons/amxmodx/configs/cvars.ini

# Revert modules.ini - remove commented cstrike and csx
RUN sed -i '/^;cstrike$/d' addons/amxmodx/configs/modules.ini && \
    sed -i '/^;csx$/d' addons/amxmodx/configs/modules.ini

# Revert plugins.ini - remove CS-specific plugin entries
RUN sed -i '/^; Counter-Strike$/,/^$/d' addons/amxmodx/configs/plugins.ini

# Remove CS-specific files
RUN rm -f addons/amxmodx/configs/stats.ini \
    addons/amxmodx/data/csstats.amxx \
    addons/amxmodx/modules/cstrike_amxx_i386.so \
    addons/amxmodx/modules/csx_amxx_i386.so \
    addons/amxmodx/plugins/miscstats.amxx \
    addons/amxmodx/plugins/restmenu.amxx \
    addons/amxmodx/plugins/stats_logging.amxx \
    addons/amxmodx/plugins/statsx.amxx \
    addons/amxmodx/scripting/csstats.sma \
    addons/amxmodx/scripting/miscstats.sma \
    addons/amxmodx/scripting/restmenu.sma \
    addons/amxmodx/scripting/stats_logging.sma \
    addons/amxmodx/scripting/statsx.sma

RUN curl -sLO "$JK_BOTTI_URL" \
    && echo "$JK_BOTTI_SHA256  $JK_BOTTI_FILENAME" | sha256sum -c - \
    && tar -C /opt/xash/xashds/valve/ -xJf "$JK_BOTTI_FILENAME" \
    && echo 'linux addons/jk_botti/dlls/jk_botti_mm_i386.so' >> /opt/xash/xashds/valve/addons/metamod/plugins.ini \
    && rm -f "$JK_BOTTI_FILENAME" \
    && patchelf --clear-execstack /opt/xash/xashds/valve/addons/jk_botti/dlls/jk_botti_mm_i386.so

FROM yohimik/hl-web-server:latest AS server

COPY --from=base "/xashds/valve" valve

USER root
RUN sed -i 's/dlls\/hl\.so/addons\/metamod\/dlls\/metamod.so/g' valve/liblist.gam
RUN cat valve/mapcycle.txt >> valve/addons/amxmodx/configs/maps.ini
USER xashds
