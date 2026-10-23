-- One incident per admitted monitoring outage, including concurrent scheduler ticks.
CREATE UNIQUE INDEX svc_monitor_episode_unique ON svc_records(workspace_id, json_extract(data_json, '$.monitorEpisodeKey'))
WHERE kind = 'incident' AND json_extract(data_json, '$.monitorEpisodeKey') IS NOT NULL;
