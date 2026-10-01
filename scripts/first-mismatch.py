"""Root-cause helper: the first oracle/TS disagreement per trace, with the ticks leading up to it."""
import collections, glob, json, os, sys

def decisions(path):
    data = json.load(open(path))
    return data["decisions"] if isinstance(data, dict) else data

first, examples = collections.Counter(), {}
for trace_path in sorted(glob.glob("evidence/controller/traces/*.json")):
    name = os.path.basename(trace_path)
    oracle = decisions(f"evidence/controller/oracle/{name}")
    ts = decisions(f"evidence/controller/ts/{name}")
    for i, (o, t) in enumerate(zip(oracle, ts)):
        if (o["action"], o["reason"]) != (t["action"], t["reason"]):
            key = (o["reason"], t["reason"])
            first[key] += 1
            examples.setdefault(key, (name, i))
            break
    else:
        if len(oracle) != len(ts):
            first[("length", len(oracle), len(ts))] += 1
print(first.most_common())
show = int(sys.argv[1]) if len(sys.argv) > 1 else 4
for key, (name, i) in list(examples.items())[:show]:
    trace = json.load(open(f"evidence/controller/traces/{name}"))
    oracle = decisions(f"evidence/controller/oracle/{name}")
    ts = decisions(f"evidence/controller/ts/{name}")
    print("==", key, name)
    for j in range(max(0, i - 5), i + 1):
        tick = trace["ticks"][j]
        print(j, tick["arousal"], tick["suds"], tick["intent"], tick["therapist"],
              "| O", oracle[j]["action"], oracle[j]["reason"], oracle[j]["level"],
              "| T", ts[j]["action"], ts[j]["reason"], ts[j]["level"])
