---
projectId: infra-project-linear-inference
title: 从一个线性模型认识推理
description: 用纯 Python 读懂输入、模型参数、预测结果和最小计时流程。
topics: [Python 入门, 模型推理, CPU 计时]
prerequisites: [变量与算术, 函数, for 循环]
environment:
  python: "3.10+"
  platforms: [Windows, Ubuntu]
  device: CPU；无需 GPU
  dependencies: []
materialStatus: 材料齐备
demo: true
contentVersion: linear-inference-v1
source:
  kind: original
  version: linear-inference-v1
  reference: 本项目原创教学样例，源码见本页
blocks:
  - blockId: infra-block-linear-demo
    file: demo.py
    language: python
fragments:
  - fragmentId: infra-fragment-linear-predict
    blockId: infra-block-linear-demo
    startLine: 3
    endLine: 7
    title: 用固定参数做预测
    explanation: 输入一个数，输出 weight*x+bias；参数由人指定，函数被重复调用，不包含训练。
    knowledgeIds: [infra-knowledge-linear-model, infra-knowledge-timing]
  - fragmentId: infra-fragment-linear-measure
    blockId: infra-block-linear-demo
    startLine: 9
    endLine: 12
    title: 计时一组推理调用
    explanation: 输入循环次数，输出总耗时；计时放在循环外，打印在计时结束后，减少无关操作干扰。
    knowledgeIds: [infra-knowledge-timing]
unitIds: [infra-unit-linear-predict, infra-unit-linear-measure]
---

## 学习目标与第一步

学完后能说明哪些数是输入、哪些数是参数，修改输入并预测结果；能解释为什么总计时包含 Python 循环开销。Python 基础按入门补课，不要求 PyTorch；先看变量与乘加，再看函数，最后看循环和计时。

整体流程：`输入 x → predict 函数读取 weight/bias → 计算 y → 打印结果`；第二阶段重复调用 predict 并测量整段耗时。

第一步在独立练习目录保存 `demo.py`，先运行 `python --version`（Ubuntu 用 `python3 --version`），再按下方源码运行。不在网站内执行 Python。无需下载模型、联网安装依赖或开启 Ubuntu 虚拟机；若选择 Ubuntu，在虚拟机自己的目录保存并运行同一文件。

## 完整代码与阅读顺序

源码来源：本项目原创 `linear-inference-v1`；从第 3—7 行读预测逻辑，再读第 9—12 行计时。

```python infra:infra-block-linear-demo
from time import perf_counter

def predict(x):
    weight = 2.0
    bias = 1.0
    return weight * x + bias
print(predict(3.0))

start = perf_counter()
for _ in range(100_000):
    predict(3.0)
elapsed = perf_counter() - start
print(f"total_seconds={elapsed:.6f}")
```

## 导学与代码旁讲解

“模型”在此是固定参数的一条计算规则。`3.0` 是输入，`2.0` 和 `1.0` 是参数，结果应为 `7.0`；预期值由公式推导，实际运行验证见下方“资料与运行状态”。参数没有从数据学习得到，不能把它描述成训练完成的智能模型。

第二片段测量十万次调用连同循环的总耗时，单位秒。`perf_counter()` 两次读数的差用于测量经过时间，单次读数不是日期。不能据此直接宣称模型优化成功，也不能跨 Windows 与虚拟机比较后就断言操作系统优劣。

页面下方提供代码讲解与关联知识链接；每个预设片段和整段代码均可单独写个人批注。

## 一次实验：先预测，再运行

1. 写下 `predict(3.0)` 与 `predict(4.0)` 的预期输出。
2. Windows 执行 `python demo.py`，Ubuntu 执行 `python3 demo.py`。预期首行 `7.0`，次行为 `total_seconds=...`；不提供虚构的固定耗时。
3. 只将第一次打印的输入改成 `4.0`，再次运行；预期首行 `9.0`，其余计时调用保持原样。
4. 记录实际 OS、Python 版本、CPU（虚拟机注明分配情况）、命令、预测、输出与解释。耗时变化可观察，不能用这次输入修改声称性能改善。

实际操作后，在下方“我的实验记录”中填写自己的预测、环境、观察和解释并保存。复制源码不代表已经完成实验。

## 常见问题

- 找不到解释器：先确认本机是否安装 Python；Ubuntu 使用 python3。此处不自动安装。
- 找不到文件：进入保存 demo.py 的目录再运行，检查没有保存成 demo.py.txt。
- 输出不同：检查输入和两个参数是否一致；缩进错误时按原代码恢复四空格函数体。


## 资料与运行状态

本项目原创教学样例 linear-inference-v1。2026-11-15 由助手在 Windows / Python 3.13.4 实际运行：输入 3 输出 7.0，输入 4 输出 9.0。十万次调用的计时会因设备和负载变化，不作为固定性能承诺；Ubuntu 尚未实测。教学示例标记继续保留，不代表用户已完成学习。

参考：[Python 数值入门](https://docs.python.org/3/tutorial/introduction.html#numbers)、[perf_counter](https://docs.python.org/3/library/time.html#time.perf_counter)。
