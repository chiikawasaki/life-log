import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import {
  dailyPoints,
  periodDays,
  shiftDay,
  summarize,
  today,
  validDate,
  type Data,
  type ReflectionPeriod,
} from "./domain";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  Filler,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  DoughnutController,
  ArcElement,
  Tooltip,
);

const periods = [
  ["week", "1週間"],
  ["month", "1ヶ月"],
  ["quarter", "3ヶ月"],
] as const;
const statusColors = [
  "#a74067",
  "#72519a",
  "#477f8d",
  "#bb7543",
  "#637540",
  "#5274a4",
  "#b35363",
  "#84684b",
  "#70588c",
  "#3f7868",
  "#956424",
  "#596478",
  "#ad634e",
];

function ChartCanvas({
  config,
  label,
}: {
  config: ChartConfiguration<"line" | "bar" | "doughnut", number[], string>;
  label: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const chart = new Chart(canvas.current, config);
    return () => chart.destroy();
  }, [config]);
  return <canvas ref={canvas} role="img" aria-label={label} />;
}

export default function Reflection({ data }: { data: Data }) {
  const [period, setPeriod] = useState<ReflectionPeriod>("month");
  const [end, setEnd] = useState(today);
  const { series, totalXp, totalCount, statuses } = useMemo(() => {
    const days = periodDays(period, end);
    const series = dailyPoints(data, days);
    const before = summarize(data, shiftDay(days[0], -1));
    const after = summarize(data, end);
    return {
      series,
      totalXp: after.xp - before.xp,
      totalCount: series.reduce((count, point) => count + point.count, 0),
      statuses: data.statuses
        .map((status, index) => ({
          ...status,
          xp: (after.points[status.id] ?? 0) - (before.points[status.id] ?? 0),
          color: statusColors[index % statusColors.length],
        }))
        .filter((status) => status.xp > 0),
    };
  }, [data, period, end]);

  const labels = series.map(({ day }) => day.slice(5).replace("-", "/"));
  const scales = {
    x: {
      ticks: { maxTicksLimit: 7, maxRotation: 0 },
      grid: { display: false },
    },
    y: { beginAtZero: true, suggestedMax: 1, ticks: { precision: 0 } },
  };
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
  };
  const cartesianOptions = {
    ...baseOptions,
    scales,
    interaction: { mode: "index" as const, intersect: false },
  };

  return (
    <div className="d-grid gap-4">
      <section
        className="card shadow-sm p-3 p-md-4"
        aria-label="振り返りの表示期間"
      >
        <div className="d-flex flex-wrap align-items-end justify-content-between gap-3">
          <div
            className="btn-group reflection-period"
            role="group"
            aria-label="表示期間"
          >
            {periods.map(([value, label]) => (
              <Fragment key={value}>
                <input
                  className="btn-check"
                  type="radio"
                  name="reflection-period"
                  id={`reflection-${value}`}
                  checked={period === value}
                  onChange={() => setPeriod(value)}
                />
                <label
                  className="btn btn-outline-primary"
                  htmlFor={`reflection-${value}`}
                >
                  {label}
                </label>
              </Fragment>
            ))}
          </div>
          <label className="small">
            この日まで
            <input
              className="form-control mt-1"
              type="date"
              value={end}
              max={today()}
              onChange={(event) => {
                const day = event.target.value;
                if (validDate(day) && day <= today()) setEnd(day);
              }}
            />
          </label>
        </div>
        <p className="small text-body-secondary mt-3 mb-1" aria-live="polite">
          {series[0].day} 〜 {series.at(-1)?.day}（日本時間）
        </p>
        <p className="fw-semibold mb-0" aria-live="polite">
          {totalXp} XP / {totalCount}件
        </p>
      </section>

      <section
        className="card shadow-sm p-3 p-md-4"
        aria-labelledby="reflection-xp"
      >
        <h2 className="h5" id="reflection-xp">
          獲得XPの推移
        </h2>
        <div className="reflection-chart">
          <ChartCanvas
            label="日ごとの獲得XPの折れ線グラフ"
            config={{
              type: "line",
              data: {
                labels,
                datasets: [
                  {
                    label: "獲得XP",
                    data: series.map(({ xp }) => xp),
                    borderColor: "#a74067",
                    backgroundColor: "#a7406720",
                    fill: true,
                    pointRadius: series.length > 35 ? 0 : 3,
                  },
                ],
              },
              options: cartesianOptions,
            }}
          />
        </div>
      </section>

      <section
        className="card shadow-sm p-3 p-md-4"
        aria-labelledby="reflection-count"
      >
        <h2 className="h5" id="reflection-count">
          日ごとの記録件数
        </h2>
        <div className="reflection-chart">
          <ChartCanvas
            label="日ごとの記録件数の棒グラフ"
            config={{
              type: "bar",
              data: {
                labels,
                datasets: [
                  {
                    label: "記録件数",
                    data: series.map(({ count }) => count),
                    backgroundColor: "#bf6b8a",
                    borderRadius: 3,
                    maxBarThickness: 28,
                  },
                ],
              },
              options: {
                ...cartesianOptions,
                scales: { ...scales, x: { ...scales.x, offset: true } },
              },
            }}
          />
        </div>
      </section>

      <section
        className="card shadow-sm p-3 p-md-4"
        aria-labelledby="reflection-status"
      >
        <h2 className="h5" id="reflection-status">
          ステータス別の獲得XP
        </h2>
        {statuses.length ? (
          <>
            <div className="reflection-chart reflection-doughnut">
              <ChartCanvas
                label="ステータス別の獲得XPのドーナツグラフ"
                config={{
                  type: "doughnut",
                  data: {
                    labels: statuses.map(({ name }) => name),
                    datasets: [
                      {
                        label: "獲得XP",
                        data: statuses.map(({ xp }) => xp),
                        backgroundColor: statuses.map(({ color }) => color),
                      },
                    ],
                  },
                  options: baseOptions,
                }}
              />
            </div>
            <ul className="list-inline text-center small mt-3 mb-0">
              {statuses.map((status) => (
                <li className="list-inline-item me-3" key={status.id}>
                  <span aria-hidden="true" style={{ color: status.color }}>
                    ●{" "}
                  </span>
                  {status.name} {status.xp} XP
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-body-secondary mb-0">
            この期間に獲得したXPはありません。
          </p>
        )}
      </section>

      <details className="card shadow-sm p-3 p-md-4">
        <summary className="fw-semibold">日別の数値を見る</summary>
        <div className="table-responsive mt-3">
          <table className="table table-sm mb-0">
            <thead>
              <tr>
                <th scope="col">日付</th>
                <th scope="col">獲得XP</th>
                <th scope="col">記録件数</th>
              </tr>
            </thead>
            <tbody>
              {series
                .slice()
                .reverse()
                .map(({ day, xp, count }) => (
                  <tr key={day}>
                    <th scope="row">{day}</th>
                    <td>{xp}</td>
                    <td>{count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
