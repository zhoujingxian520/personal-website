---
knowledgeId: infra-knowledge-timing
title: 用经过时间观察一次计算
description: 区分计算职责、重复调用和总耗时，先说明测量范围再解释结果。
demo: true
contentVersion: "1"
sources:
  - https://docs.python.org/3/library/time.html#time.perf_counter
---

**解决什么问题：**观察一段操作消耗多少时间。直观例子：测量做十次同一动作的总时间，不应把准备或汇报时间混入后却当成动作本身时间。

**必要原理：**在循环前后读取 perf_counter，差值是经过时间，单位为秒；本例范围包含 Python 循环与函数调用开销，打印不在其中。


**常见误解：**一次读数不是时间戳；总耗时不等于纯算子耗时；虚拟机与宿主机条件不同，一次结果不能证明某个平台更快。

**验证理解：**指出计时开始和结束的位置；解释把 print 放进循环会测到什么。此处不提供实测性能数字。
