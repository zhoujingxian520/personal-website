---
knowledgeId: infra-knowledge-linear-model
title: 输入、模型参数与线性预测
description: 从一次乘加认识固定参数如何把输入变成输出。
demo: true
contentVersion: "1"
sources:
  - https://docs.python.org/3/tutorial/introduction.html#numbers
---

**解决什么问题：**用一条明确规则把输入映射为预测。直观例子：每件物品 2 元、固定费用 1 元，3 件是 7 元，4 件是 9 元。

**必要原理：**`y = weight * x + bias`。x 是输入，weight 和 bias 是参数，y 是输出。这个样例参数由作者指定；推理是使用参数计算，训练则需要额外过程去确定参数。


**常见误解：**能计算一个结果不等于预测符合真实世界；手工设置参数也不等于学过训练算法。

**验证理解：**不运行代码先算出输入 5 的结果；修改一个参数后解释输出为何变化。个人掌握状态在学习单元中维护，不在知识页维护第二份。
